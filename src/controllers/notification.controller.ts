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
  source: 'tour';
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

      // Fetch tour notifications only (escrow notifications deprecated)
      const tourNotifications = await db.tourNotification.findMany({
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

      // Transform notifications
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

      // Get total counts for stats
      const [tourTotalCount, tourUnreadCount] = await Promise.all([
        db.tourNotification.count({ where: { userId } }),
        db.tourNotification.count({ where: { userId, isRead: false } })
      ]);

      res.json({
        success: true,
        message: 'Notifications fetched successfully',
        data: {
          notifications: transformedTourNotifications,
          total: tourTotalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(tourTotalCount / limitNum),
          stats: {
            unreadCount: tourUnreadCount,
            totalCount: tourTotalCount,
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

      // Find in tour notifications only (escrow deprecated)
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

      // Update in tour notifications only (escrow deprecated)
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

      // Update in tour notifications only (escrow deprecated)
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

      // Update tour notifications only (escrow deprecated)
      const tourUpdated = await db.tourNotification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
      });

      res.json({
        success: true,
        message: `${tourUpdated.count} notifications marked as read`,
        data: { updatedCount: tourUpdated.count }
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

      // Delete from tour notifications only (escrow deprecated)
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
        data
      } = req.body;

      if (!userId || !title || !message) {
        return res.status(400).json({
          success: false,
          message: 'userId, title, and message are required'
        });
      }

      // Create tour notification only (escrow deprecated)
      const newNotification = await db.tourNotification.create({
        data: {
          userId,
          title,
          message,
          type,
          data,
          isRead: false
        }
      });

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

      // Get stats from tour notifications only (escrow deprecated)
      const tourStats = await db.tourNotification.groupBy({
        by: ['type'],
        where: { userId },
        _count: { _all: true }
      });

      // Get total counts
      const [tourTotalCount, tourUnreadCount] = await Promise.all([
        db.tourNotification.count({ where: { userId } }),
        db.tourNotification.count({ where: { userId, isRead: false } })
      ]);

      // Type statistics
      const typeStats: Record<string, number> = {};
      tourStats.forEach(stat => {
        typeStats[stat.type] = stat._count._all;
      });

      const stats = {
        total: tourTotalCount,
        unread: tourUnreadCount,
        byType: typeStats,
        bySource: {
          tour: tourTotalCount
        },
        unreadBySource: {
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