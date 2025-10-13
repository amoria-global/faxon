// src/controllers/kyc-reminder.controller.ts
import { Request, Response, NextFunction } from 'express';
import { KYCReminderService } from '../services/kyc-reminder.service';

const kycReminderService = new KYCReminderService();

export class KYCReminderController {
  /**
   * Manually trigger reminder processing (for testing/admin use)
   */
  async triggerReminders(req: Request, res: Response, next: NextFunction) {
    try {
      console.log('🔄 Manual trigger of KYC reminder processing');
      const results = await kycReminderService.processReminders();
      
      res.json({
        success: true,
        message: 'KYC reminder processing completed',
        data: results,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('❌ Error in manual reminder trigger:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process reminders',
        error: error.message
      });
    }
  }

  /**
   * Get reminder service status
   */
  async getStatus(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        data: {
          service: 'KYC Reminder Service',
          status: 'running',
          checkInterval: '2 minutes',
          features: [
            'KYC completion reminders (2h, 8h, 24h, 3d, 5d, 7d)',
            'Password setup reminders',
            'Account deactivation (90 days)',
            'Automatic deletion scheduling (180 days total)'
          ],
          lastCheck: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to get status',
        error: error.message
      });
    }
  }

  /**
   * Get statistics about pending reminders
   */
  async getStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const [
        usersNeedingKYC,
        usersNeedingPassword,
        accountsNearDeactivation,
        inactiveAccounts
      ] = await Promise.all([
        prisma.user.count({
          where: {
            userType: { in: ['host', 'agent', 'tourguide'] },
            kycCompleted: false,
            status: { notIn: ['suspended', 'inactive'] },
            createdAt: { lte: twoHoursAgo }
          }
        }),
        prisma.user.count({
          where: {
            userType: { in: ['host', 'agent', 'tourguide'] },
            password: null,
            status: { notIn: ['suspended', 'inactive'] },
            createdAt: { lte: twoHoursAgo }
          }
        }),
        prisma.user.count({
          where: {
            userType: { in: ['host', 'agent', 'tourguide'] },
            kycCompleted: false,
            status: { notIn: ['suspended', 'inactive'] },
            createdAt: {
              lte: new Date(now.getTime() - 83 * 24 * 60 * 60 * 1000), // 83 days (7 days before deactivation)
              gte: ninetyDaysAgo
            }
          }
        }),
        prisma.user.count({
          where: {
            status: 'inactive',
            userType: { in: ['host', 'agent', 'tourguide'] }
          }
        })
      ]);

      await prisma.$disconnect();

      res.json({
        success: true,
        data: {
          usersNeedingKYC,
          usersNeedingPassword,
          accountsNearDeactivation,
          inactiveAccounts,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('❌ Error getting statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get statistics',
        error: error.message
      });
    }
  }
}
