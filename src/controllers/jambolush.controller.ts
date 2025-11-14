/**
 * JamboLush Admin Settings Controller
 * Handles all admin settings API endpoints
 */

import { Request, Response } from 'express';
import jamboLushAdminSettingsService from '../services/jambolush-admin-settings.service';
import { ApiResponse } from '../types/admin-settings.types';

export class JamboLushController {
  // ============================================
  // PAYMENT PROVIDERS
  // ============================================

  async getAllPaymentProviders(req: Request, res: Response): Promise<void> {
    try {
      const providers = await jamboLushAdminSettingsService.getAllPaymentProviders();

      // Transform to match frontend format
      const transformed = providers.map((p) => {
        const masked = jamboLushAdminSettingsService.maskCredentials(p.credentials);
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          region: p.region,
          enabled: p.enabled,
          testMode: p.testMode,
          config: {
            testUrl: (p.config as any)?.testUrl || '',
            productionUrl: (p.config as any)?.baseUrl || (p.config as any)?.productionUrl || '',
            apiKey: masked.apiKey || '',
            secretKey: masked.secretKey || '',
            merchantId: masked.merchantId || '',
            webhookUrl: (p.config as any)?.webhookUrl || '',
            supportedMethods: (p.config as any)?.supportedMethods || []
          },
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        };
      });

      const response: ApiResponse = {
        success: true,
        message: 'Providers retrieved successfully',
        data: { providers: transformed },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch payment providers');
    }
  }

  async getPaymentProvider(req: Request, res: Response): Promise<void> {
    try {
      const { providerId } = req.params;
      const provider = await jamboLushAdminSettingsService.getPaymentProvider(providerId);

      if (!provider) {
        res.status(404).json(this.errorResponse('Payment provider not found', 404));
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: {
          ...provider,
          credentials: jamboLushAdminSettingsService.maskCredentials(provider.credentials),
        },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch payment provider');
    }
  }

  async createPaymentProvider(req: Request, res: Response): Promise<void> {
    try {
      const provider = await jamboLushAdminSettingsService.createPaymentProvider(req.body);

      await this.logAudit(req, 'CREATE_PAYMENT_PROVIDER', 'payment', 'success', {
        providerId: provider.id,
        providerName: provider.name,
      });

      const response: ApiResponse = {
        success: true,
        message: 'Payment provider created successfully',
        data: {
          ...provider,
          credentials: jamboLushAdminSettingsService.maskCredentials(provider.credentials),
        },
        status: 201,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (error: any) {
      await this.logAudit(req, 'CREATE_PAYMENT_PROVIDER', 'payment', 'failed', {
        error: error.message,
      });
      this.handleError(res, error, 'Failed to create payment provider');
    }
  }

  async updatePaymentProvider(req: Request, res: Response): Promise<void> {
    try {
      const { providerId } = req.params;
      const provider = await jamboLushAdminSettingsService.updatePaymentProvider(
        providerId,
        req.body
      );

      await this.logAudit(req, 'UPDATE_PAYMENT_PROVIDER', 'payment', 'success', {
        providerId,
        updates: Object.keys(req.body),
      });

      const response: ApiResponse = {
        success: true,
        message: 'Payment provider updated successfully',
        data: {
          ...provider,
          credentials: jamboLushAdminSettingsService.maskCredentials(provider.credentials),
        },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      await this.logAudit(req, 'UPDATE_PAYMENT_PROVIDER', 'payment', 'failed', {
        providerId: req.params.providerId,
        error: error.message,
      });
      this.handleError(res, error, 'Failed to update payment provider');
    }
  }

  async testPaymentProvider(req: Request, res: Response): Promise<void> {
    try {
      const { providerId } = req.params;
      const result = await jamboLushAdminSettingsService.testPaymentProvider(providerId);

      const response: ApiResponse = {
        success: result.connected,
        data: result,
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to test payment provider');
    }
  }

  // ============================================
  // OPERATORS
  // ============================================

  async getAllOperators(req: Request, res: Response): Promise<void> {
    try {
      const { country, type, enabled } = req.query;

      const operators = await jamboLushAdminSettingsService.getAllOperators({
        country: country as string,
        type: type as string,
        enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
      });

      // Transform to match frontend format
      const transformed = operators.map((op: any) => ({
        id: op.id,
        name: op.name,
        code: op.code,
        providerId: op.providerId || op.code.split('_')[0], // Extract from code if not set
        country: op.country,
        type: op.type,
        enabled: op.enabled,
        primaryProvider: op.primaryProviderId,        // Rename field
        alternativeProvider: op.alternativeProviderId, // Rename field
        supportedOperations: op.supportedOperations,
        createdAt: op.createdAt,
        updatedAt: op.updatedAt
      }));

      const response: ApiResponse = {
        success: true,
        message: 'Operators retrieved successfully',
        data: {
          operators: transformed,
          total: operators.length,
        },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch operators');
    }
  }

  async updateOperator(req: Request, res: Response): Promise<void> {
    try {
      const { operatorCode } = req.params;
      const operator = await jamboLushAdminSettingsService.updateOperator(
        operatorCode,
        req.body
      );

      await this.logAudit(req, 'UPDATE_OPERATOR', 'payment', 'success', {
        operatorCode,
        updates: Object.keys(req.body),
      });

      const response: ApiResponse = {
        success: true,
        message: 'Operator updated successfully',
        data: operator,
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to update operator');
    }
  }

  // ============================================
  // COMMUNICATIONS
  // ============================================

  async getAllCommunicationSettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = await jamboLushAdminSettingsService.getAllCommunicationSettings();

      // Mask API keys
      const masked = settings.map((s) => ({
        ...s,
        config: {
          ...s.config,
          apiKey: s.config.apiKey ? '***' + s.config.apiKey.slice(-4) : undefined,
        },
      }));

      const response: ApiResponse = {
        success: true,
        data: {
          email: masked.find((s) => s.id === 'email'),
          sms: masked.find((s) => s.id === 'sms'),
          whatsapp: masked.find((s) => s.id === 'whatsapp'),
        },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch communication settings');
    }
  }

  async getCommunicationSetting(req: Request, res: Response): Promise<void> {
    try {
      const { channel } = req.params;
      const setting = await jamboLushAdminSettingsService.getCommunicationSetting(
        channel as 'email' | 'sms' | 'whatsapp'
      );

      if (!setting) {
        res.status(404).json({
          success: false,
          message: `Communication settings for ${channel} not found`,
          status: 404,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Mask API key
      const masked = {
        ...setting,
        config: {
          ...setting.config,
          apiKey: setting.config.apiKey ? '***' + setting.config.apiKey.slice(-4) : undefined,
        },
      };

      const response: ApiResponse = {
        success: true,
        data: { setting: masked },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch communication setting');
    }
  }

  async updateCommunicationSetting(req: Request, res: Response): Promise<void> {
    try {
      const { channel } = req.params;
      const setting = await jamboLushAdminSettingsService.updateCommunicationSetting(
        channel as 'email' | 'sms' | 'whatsapp',
        req.body
      );

      await this.logAudit(req, 'UPDATE_COMMUNICATION_SETTINGS', 'communication', 'success', {
        channel,
        updates: Object.keys(req.body),
      });

      const response: ApiResponse = {
        success: true,
        message: `${channel} settings updated successfully`,
        data: {
          ...setting,
          config: {
            ...setting.config,
            apiKey: setting.config.apiKey ? '***' + setting.config.apiKey.slice(-4) : undefined,
          },
        },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to update communication settings');
    }
  }

  // ============================================
  // SECURITY
  // ============================================

  async getSecuritySettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = await jamboLushAdminSettingsService.getAllSecuritySettings();

      const grouped: any = {
        twoFactor: {},
        session: {},
        passwordPolicy: {},
        apiSecurity: {},
      };

      settings.forEach((setting) => {
        grouped[setting.category] = setting.settings;
      });

      const response: ApiResponse = {
        success: true,
        data: grouped,
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch security settings');
    }
  }

  async updateSecuritySettings(req: Request, res: Response): Promise<void> {
    try {
      await jamboLushAdminSettingsService.updateSecuritySettings(req.body);

      await this.logAudit(req, 'UPDATE_SECURITY_SETTINGS', 'security', 'success', {
        categories: Object.keys(req.body),
      });

      const response: ApiResponse = {
        success: true,
        message: 'Security settings updated successfully',
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to update security settings');
    }
  }

  // ============================================
  // BUSINESS RULES
  // ============================================

  async getAllBusinessRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = await jamboLushAdminSettingsService.getAllBusinessRules();

      const grouped: any = {
        booking: {},
        cancellation: {},
        payment: {},
        commission: {},
        system: {},
        financial: {},
        limits: {},
      };

      rules.forEach((rule) => {
        grouped[rule.category] = rule.rules;
      });

      const response: ApiResponse = {
        success: true,
        data: grouped,
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch business rules');
    }
  }

  async updateBusinessRules(req: Request, res: Response): Promise<void> {
    try {
      await jamboLushAdminSettingsService.updateBusinessRules(req.body);

      await this.logAudit(req, 'UPDATE_BUSINESS_RULES', 'business', 'success', {
        categories: Object.keys(req.body),
      });

      const response: ApiResponse = {
        success: true,
        message: 'Business rules updated successfully',
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to update business rules');
    }
  }

  async toggleSystemFeature(req: Request, res: Response): Promise<void> {
    try {
      const { feature, enabled, message, scheduledEnd } = req.body;

      // Update system rules
      await jamboLushAdminSettingsService.updateBusinessRules({
        system: {
          [feature]: enabled,
        },
      });

      await this.logAudit(req, 'TOGGLE_SYSTEM_FEATURE', 'system', 'success', {
        feature,
        enabled,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          feature,
          enabled,
          activatedAt: new Date().toISOString(),
          scheduledEnd,
          message,
        },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to toggle system feature');
    }
  }

  // ============================================
  // AUTOMATED JOBS
  // ============================================

  async getAllJobs(req: Request, res: Response): Promise<void> {
    try {
      const jobs = await jamboLushAdminSettingsService.getAllJobs();

      const response: ApiResponse = {
        success: true,
        data: { jobs },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch automated jobs');
    }
  }

  async createJob(req: Request, res: Response): Promise<void> {
    try {
      const job = await jamboLushAdminSettingsService.createJob(req.body);

      await this.logAudit(req, 'CREATE_AUTOMATED_JOB', 'automation', 'success', {
        jobId: job.id,
        jobType: job.jobType,
      });

      const response: ApiResponse = {
        success: true,
        data: job,
        status: 201,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to create automated job');
    }
  }

  async updateJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const job = await jamboLushAdminSettingsService.updateJob(jobId, req.body);

      await this.logAudit(req, 'UPDATE_AUTOMATED_JOB', 'automation', 'success', {
        jobId,
      });

      const response: ApiResponse = {
        success: true,
        message: 'Job updated successfully',
        data: job,
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to update job');
    }
  }

  async executeJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const result = await jamboLushAdminSettingsService.executeJob(jobId);

      const response: ApiResponse = {
        success: true,
        data: result,
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to execute job');
    }
  }

  async getJobTypes(req: Request, res: Response): Promise<void> {
    // Static list of available job types
    const jobTypes = [
      {
        type: 'send_payment_reminders',
        name: 'Payment Reminder Notifications',
        description: 'Send automated reminders for pending payments',
        category: 'payments',
        configurable: true,
        supportedChannels: ['email', 'sms', 'whatsapp'],
      },
      {
        type: 'welcome_new_users',
        name: 'Welcome New Users',
        description: 'Send welcome emails and onboarding materials to new users',
        category: 'users',
        configurable: true,
        supportedChannels: ['email', 'sms'],
      },
      {
        type: 'booking_confirmations',
        name: 'Booking Confirmations',
        description: 'Send booking confirmation notifications',
        category: 'bookings',
        configurable: true,
        supportedChannels: ['email', 'sms', 'whatsapp'],
      },
      {
        type: 'daily_revenue_report',
        name: 'Daily Revenue Report',
        description: 'Generate and send daily revenue reports to admins',
        category: 'reporting',
        configurable: true,
        supportedChannels: ['email'],
      },
      {
        type: 'pending_kyc_reminders',
        name: 'KYC Verification Reminders',
        description: 'Remind users to complete KYC verification',
        category: 'compliance',
        configurable: true,
        supportedChannels: ['email', 'sms'],
      },
    ];

    const response: ApiResponse = {
      success: true,
      data: { jobTypes },
      status: 200,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // ============================================
  // WEBHOOKS
  // ============================================

  async getAllWebhooks(req: Request, res: Response): Promise<void> {
    try {
      const webhooks = await jamboLushAdminSettingsService.getAllWebhooks();

      const response: ApiResponse = {
        success: true,
        data: { webhooks },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch webhooks');
    }
  }

  async createWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhook = await jamboLushAdminSettingsService.createWebhook(req.body);

      await this.logAudit(req, 'CREATE_WEBHOOK', 'webhook', 'success', {
        webhookId: webhook.id,
      });

      const response: ApiResponse = {
        success: true,
        data: webhook,
        status: 201,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to create webhook');
    }
  }

  // ============================================
  // NOTIFICATION TEMPLATES
  // ============================================

  async getAllTemplates(req: Request, res: Response): Promise<void> {
    try {
      const { channel, category } = req.query;

      const templates = await jamboLushAdminSettingsService.getAllTemplates({
        channel: channel as string,
        category: category as string,
      });

      const response: ApiResponse = {
        success: true,
        data: { templates },
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch templates');
    }
  }

  async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const template = await jamboLushAdminSettingsService.createTemplate(req.body);

      const response: ApiResponse = {
        success: true,
        data: template,
        status: 201,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to create template');
    }
  }

  // ============================================
  // AUDIT LOGS
  // ============================================

  async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const { userId, action, startDate, endDate, page, limit } = req.query;

      const result = await jamboLushAdminSettingsService.getAuditLogs({
        userId: userId ? parseInt(userId as string) : undefined,
        action: action as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
      });

      const response: ApiResponse = {
        success: true,
        data: result,
        status: 200,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      this.handleError(res, error, 'Failed to fetch audit logs');
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private errorResponse(message: string, status: number): ApiResponse {
    return {
      success: false,
      error: message,
      status,
      timestamp: new Date().toISOString(),
    };
  }

  private handleError(res: Response, error: any, defaultMessage: string): void {
    console.error(`${defaultMessage}:`, error);

    const status = error.statusCode || 500;
    const message = error.message || defaultMessage;

    res.status(status).json(this.errorResponse(message, status));
  }

  private async logAudit(
    req: Request,
    action: string,
    category: string,
    status: 'success' | 'failed',
    metadata?: any
  ): Promise<void> {
    try {
      await jamboLushAdminSettingsService.createAuditLog({
        userId: (req as any).user?.id,
        action,
        category,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status,
        metadata,
      });
    } catch (error) {
      console.error('Failed to log audit:', error);
    }
  }
}

// Export singleton instance
export const jamboLushController = new JamboLushController();
export default jamboLushController;
