// controllers/notification.controller.ts
import { Request, Response } from 'express';
import db from '../utils/db';

export interface UnifiedNotification {
  id: string;
  userId: number;
  title: string;
  message: string;
  type: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  isRead: boolean;
  actionUrl?: string;
  fromUser?: string;
  relatedEntity?: string;
  metadata?: any;
  source: 'escrow' | 'tour';
  escrowTransactionId?: string;
  data?: any;
  channels?: string[];
  readAt?: Date;
  sentAt?: Date;
  emailSent?: boolean;
  smsSent?: boolean;
  pushSent?: boolean;
}

export const notificationController = {
  // Get notifications with filters and pagination
  async getNotifications(req: Request, res: Response) {
    try {
      // Get user ID from auth middleware
      const userId = (req as any).user?.id || 1;

      // Apply filters
      const {
        search,
        type,
        category,
        priority,
        status, // 'read' | 'unread' | 'all'
        sortField = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 10,
        source // 'escrow' | 'tour' | 'all'
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      // Build where clause
      const baseWhere = { userId };
      const searchWhere = search ? {
        OR: [
          { title: { contains: search as string, mode: 'insensitive' as any } },
          { message: { contains: search as string, mode: 'insensitive' as any } },
          { type: { contains: search as string, mode: 'insensitive' as any } }
        ]
      } : {};

      const typeWhere = type && type !== 'all' ? { type: type as string } : {};
      const statusWhere = status && status !== 'all' ? { isRead: status === 'read' } : {};

      // Fetch escrow notifications
      let escrowNotifications: any[] = [];
      if (!source || source === 'all' || source === 'escrow') {
        escrowNotifications = await db.escrowNotification.findMany({
          where: {
            ...baseWhere,
            ...searchWhere,
            ...typeWhere,
            ...statusWhere
          },
          include: {
            escrowTransaction: {
              select: { reference: true, amount: true, currency: true }
            }
          },
          orderBy: {
            [sortField === 'timestamp' ? 'createdAt' : sortField as string]: sortOrder
          },
          skip,
          take: limitNum
        });
      }

      // Fetch tour notifications
      let tourNotifications: any[] = [];
      if (!source || source === 'all' || source === 'tour') {
        tourNotifications = await db.tourNotification.findMany({
          where: {
            ...baseWhere,
            ...searchWhere,
            ...typeWhere,
            ...statusWhere
          },
          orderBy: {
            [sortField === 'timestamp' ? 'createdAt' : sortField as string]: sortOrder
          },
          skip,
          take: limitNum
        });
      }

      // Transform and combine notifications
      const transformedEscrowNotifications: UnifiedNotification[] = escrowNotifications.map(n => ({
        id: n.id,
        userId: n.userId,
        title: n.title,
        message: n.message,
        type: n.type,
        timestamp: n.createdAt,
        isRead: n.isRead,
        metadata: n.data,
        source: 'escrow' as const,
        escrowTransactionId: n.escrowTransactionId || undefined,
        data: n.data,
        channels: (n.channels as string[]) || undefined,
        readAt: n.readAt || undefined,
        sentAt: n.sentAt || undefined,
        emailSent: n.emailSent,
        smsSent: n.smsSent,
        pushSent: n.pushSent,
        relatedEntity: n.escrowTransaction?.reference
      }));

      const transformedTourNotifications: UnifiedNotification[] = tourNotifications.map(n => ({
        id: n.id,
        userId: n.userId,
        title: n.title,
        message: n.message,
        type: n.type,
        timestamp: n.createdAt,
        isRead: n.isRead,
        metadata: n.data,
        source: 'tour' as const,
        data: n.data
      }));

      // Combine and sort all notifications
      let allNotifications = [...transformedEscrowNotifications, ...transformedTourNotifications];

      // Sort combined notifications
      allNotifications.sort((a, b) => {
        const aTime = new Date(a.timestamp).getTime();
        const bTime = new Date(b.timestamp).getTime();
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      });

      // Apply pagination to combined results
      const paginatedNotifications = allNotifications.slice(0, limitNum);

      // Get total counts for stats
      const [escrowTotalCount, escrowUnreadCount, tourTotalCount, tourUnreadCount] = await Promise.all([
        db.escrowNotification.count({ where: { userId } }),
        db.escrowNotification.count({ where: { userId, isRead: false } }),
        db.tourNotification.count({ where: { userId } }),
        db.tourNotification.count({ where: { userId, isRead: false } })
      ]);

      const totalCount = escrowTotalCount + tourTotalCount;
      const unreadCount = escrowUnreadCount + tourUnreadCount;

      res.json({
        success: true,
        message: 'Notifications fetched successfully',
        data: {
          notifications: paginatedNotifications,
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum),
          stats: {
            unreadCount,
            totalCount,
            escrowCount: escrowTotalCount,
            tourCount: tourTotalCount
          }
        }
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications',
        errors: [(error as Error).message]
      });
    }
  },

  // Get single notification
  async getNotification(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id || 1;

      // Try to find in escrow notifications first
      let notification = await db.escrowNotification.findFirst({
        where: { id, userId },
        include: {
          escrowTransaction: {
            select: { reference: true, amount: true, currency: true }
          }
        }
      });

      if (notification) {
        const transformedNotification: UnifiedNotification = {
          id: notification.id,
          userId: notification.userId,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          timestamp: notification.createdAt,
          isRead: notification.isRead,
          metadata: notification.data,
          source: 'escrow',
          escrowTransactionId: notification.escrowTransactionId || undefined,
          data: notification.data,
          channels: (notification.channels as string[]) || undefined,
          readAt: notification.readAt || undefined,
          sentAt: notification.sentAt || undefined,
          emailSent: notification.emailSent,
          smsSent: notification.smsSent,
          pushSent: notification.pushSent,
          relatedEntity: notification.escrowTransaction?.reference
        };

        return res.json({
          success: true,
          message: 'Notification fetched successfully',
          data: transformedNotification
        });
      }

      // Try to find in tour notifications
      const tourNotification = await db.tourNotification.findFirst({
        where: { id, userId }
      });

      if (tourNotification) {
        const transformedTourNotification: UnifiedNotification = {
          id: tourNotification.id,
          userId: tourNotification.userId,
          title: tourNotification.title,
          message: tourNotification.message,
          type: tourNotification.type,
          timestamp: tourNotification.createdAt,
          isRead: tourNotification.isRead,
          metadata: tourNotification.data,
          source: 'tour',
          data: tourNotification.data
        };

        return res.json({
          success: true,
          message: 'Notification fetched successfully',
          data: transformedTourNotification
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    } catch (error) {
      console.error('Error fetching notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notification',
        errors: [(error as Error).message]
      });
    }
  },

  // Mark notification as read
  async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id || 1;

      // Try to update in escrow notifications first
      const escrowUpdated = await db.escrowNotification.updateMany({
        where: { id, userId },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      if (escrowUpdated.count > 0) {
        return res.json({
          success: true,
          message: 'Notification marked as read'
        });
      }

      // Try to update in tour notifications
      const tourUpdated = await db.tourNotification.updateMany({
        where: { id, userId },
        data: { isRead: true }
      });

      if (tourUpdated.count > 0) {
        return res.json({
          success: true,
          message: 'Notification marked as read'
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        errors: [(error as Error).message]
      });
    }
  },

  // Mark notification as unread
  async markAsUnread(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id || 1;

      // Try to update in escrow notifications first
      const escrowUpdated = await db.escrowNotification.updateMany({
        where: { id, userId },
        data: {
          isRead: false,
          readAt: null
        }
      });

      if (escrowUpdated.count > 0) {
        return res.json({
          success: true,
          message: 'Notification marked as unread'
        });
      }

      // Try to update in tour notifications
      const tourUpdated = await db.tourNotification.updateMany({
        where: { id, userId },
        data: { isRead: false }
      });

      if (tourUpdated.count > 0) {
        return res.json({
          success: true,
          message: 'Notification marked as unread'
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    } catch (error) {
      console.error('Error marking notification as unread:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as unread',
        errors: [(error as Error).message]
      });
    }
  },

  // Mark all notifications as read
  async markAllAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id || 1;

      // Update both escrow and tour notifications
      const [escrowUpdated, tourUpdated] = await Promise.all([
        db.escrowNotification.updateMany({
          where: { userId, isRead: false },
          data: {
            isRead: true,
            readAt: new Date()
          }
        }),
        db.tourNotification.updateMany({
          where: { userId, isRead: false },
          data: { isRead: true }
        })
      ]);

      const totalUpdated = escrowUpdated.count + tourUpdated.count;

      res.json({
        success: true,
        message: `${totalUpdated} notifications marked as read`,
        data: { updatedCount: totalUpdated }
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read',
        errors: [(error as Error).message]
      });
    }
  },

  // Delete notification
  async deleteNotification(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id || 1;

      // Try to delete from escrow notifications first
      const escrowDeleted = await db.escrowNotification.deleteMany({
        where: { id, userId }
      });

      if (escrowDeleted.count > 0) {
        return res.json({
          success: true,
          message: 'Notification deleted successfully'
        });
      }

      // Try to delete from tour notifications
      const tourDeleted = await db.tourNotification.deleteMany({
        where: { id, userId }
      });

      if (tourDeleted.count > 0) {
        return res.json({
          success: true,
          message: 'Notification deleted successfully'
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        errors: [(error as Error).message]
      });
    }
  },

  // Create notification (for system use)
  async createNotification(req: Request, res: Response) {
    try {
      const {
        userId,
        title,
        message,
        type = 'info',
        source = 'tour',
        escrowTransactionId,
        channels = ['in_app'],
        data
      } = req.body;

      if (!userId || !title || !message) {
        return res.status(400).json({
          success: false,
          message: 'userId, title, and message are required'
        });
      }

      let newNotification;

      if (source === 'escrow') {
        newNotification = await db.escrowNotification.create({
          data: {
            userId,
            title,
            message,
            type,
            escrowTransactionId,
            channels,
            data,
            isRead: false
          }
        });
      } else {
        newNotification = await db.tourNotification.create({
          data: {
            userId,
            title,
            message,
            type,
            data,
            isRead: false
          }
        });
      }

      res.status(201).json({
        success: true,
        message: 'Notification created successfully',
        data: newNotification
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create notification',
        errors: [(error as Error).message]
      });
    }
  },

  // Get notification statistics
  async getStats(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id || 1;

      // Get stats from both tables using simpler count queries
      const [escrowStats, tourStats] = await Promise.all([
        db.escrowNotification.groupBy({
          by: ['type'],
          where: { userId },
          _count: { _all: true }
        }),
        db.tourNotification.groupBy({
          by: ['type'],
          where: { userId },
          _count: { _all: true }
        })
      ]);

      // Get total counts
      const [escrowTotalCount, escrowUnreadCount, tourTotalCount, tourUnreadCount] = await Promise.all([
        db.escrowNotification.count({ where: { userId } }),
        db.escrowNotification.count({ where: { userId, isRead: false } }),
        db.tourNotification.count({ where: { userId } }),
        db.tourNotification.count({ where: { userId, isRead: false } })
      ]);

      const totalCount = escrowTotalCount + tourTotalCount;
      const unreadCount = escrowUnreadCount + tourUnreadCount;

      // Combine type statistics
      const typeStats: Record<string, number> = {};
      [...escrowStats, ...tourStats].forEach(stat => {
        typeStats[stat.type] = (typeStats[stat.type] || 0) + stat._count._all;
      });

      const stats = {
        total: totalCount,
        unread: unreadCount,
        byType: typeStats,
        bySource: {
          escrow: escrowTotalCount,
          tour: tourTotalCount
        },
        unreadBySource: {
          escrow: escrowUnreadCount,
          tour: tourUnreadCount
        }
      };

      res.json({
        success: true,
        message: 'Notification statistics fetched successfully',
        data: stats
      });
    } catch (error) {
      console.error('Error fetching notification stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notification statistics',
        errors: [(error as Error).message]
      });
    }
  }
};