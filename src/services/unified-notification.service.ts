// src/services/unified-notification.service.ts - Centralized Notification System
// Supports multi-user notifications for all activities across the app

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface CreateNotificationDto {
  userId: number | number[]; // Support single or multiple users
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'unlock' | 'booking' | 'payment' | 'review' | 'property' | 'tour';
  category?: 'unlock_request' | 'unlock_approved' | 'unlock_cancelled' | 'booking_created' | 'payment_received' | 'deal_code_generated' | 'general';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  actionUrl?: string;
  relatedEntityType?: 'property' | 'booking' | 'unlock' | 'payment' | 'tour' | 'review';
  relatedEntityId?: string | number;
  metadata?: Record<string, any>;
  channels?: ('app' | 'email' | 'sms' | 'push')[];
}

export interface NotificationFilter {
  userId?: number;
  type?: string;
  category?: string;
  isRead?: boolean;
  startDate?: Date;
  endDate?: Date;
}

export class UnifiedNotificationService {
  /**
   * Create notification(s) for one or multiple users
   * Supports broadcasting to multiple users with single call
   */
  async createNotification(data: CreateNotificationDto): Promise<void> {
    try {
      const userIds = Array.isArray(data.userId) ? data.userId : [data.userId];

      // Create notifications for all specified users
      const notifications = userIds.map(userId => ({
        userId,
        title: data.title,
        message: data.message,
        type: data.type,
        data: {
          category: data.category,
          priority: data.priority || 'medium',
          actionUrl: data.actionUrl,
          relatedEntityType: data.relatedEntityType,
          relatedEntityId: data.relatedEntityId?.toString(),
          metadata: data.metadata,
          channels: data.channels || ['app'],
        },
        isRead: false,
      }));

      await prisma.tourNotification.createMany({
        data: notifications,
      });

      logger.info('Notifications created successfully', 'UnifiedNotificationService', {
        userCount: userIds.length,
        type: data.type,
        category: data.category,
      });

      // TODO: Trigger email/SMS/push notifications based on channels
      if (data.channels?.includes('email')) {
        // await this.sendEmailNotifications(userIds, data);
      }
      if (data.channels?.includes('sms')) {
        // await this.sendSMSNotifications(userIds, data);
      }
      if (data.channels?.includes('push')) {
        // await this.sendPushNotifications(userIds, data);
      }
    } catch (error) {
      logger.error('Failed to create notifications', 'UnifiedNotificationService', { error, data });
      throw error;
    }
  }

  /**
   * Unlock-specific notification helpers
   */
  async notifyUnlockRequest(data: {
    guestId: number;
    hostId: number;
    propertyId: number;
    propertyName: string;
    unlockId: string;
    paymentMethod: string;
  }): Promise<void> {
    // Notify guest
    await this.createNotification({
      userId: data.guestId,
      title: 'Unlock Request Submitted',
      message: `Your request to unlock "${data.propertyName}" has been submitted.`,
      type: 'unlock',
      category: 'unlock_request',
      priority: 'medium',
      actionUrl: `/unlocks/${data.unlockId}`,
      relatedEntityType: 'unlock',
      relatedEntityId: data.unlockId,
      metadata: {
        propertyId: data.propertyId,
        paymentMethod: data.paymentMethod,
      },
      channels: ['app', 'email'],
    });

    // Notify host (no money details)
    await this.createNotification({
      userId: data.hostId,
      title: 'New Address Unlock Request',
      message: `A guest has requested directions to "${data.propertyName}". You can now share contact information.`,
      type: 'unlock',
      category: 'unlock_request',
      priority: 'high',
      actionUrl: `/host/unlock-requests`,
      relatedEntityType: 'unlock',
      relatedEntityId: data.unlockId,
      metadata: {
        propertyId: data.propertyId,
      },
      channels: ['app', 'email'],
    });
  }

  async notifyUnlockCancellation(data: {
    guestId: number;
    hostId: number;
    propertyId: number;
    propertyName: string;
    unlockId: string;
  }): Promise<void> {
    // Notify guest
    await this.createNotification({
      userId: data.guestId,
      title: 'Unlock Request Cancelled',
      message: `Your unlock request for "${data.propertyName}" has been cancelled. You can request a deal code if eligible.`,
      type: 'unlock',
      category: 'unlock_cancelled',
      priority: 'medium',
      actionUrl: `/unlocks/${data.unlockId}`,
      relatedEntityType: 'unlock',
      relatedEntityId: data.unlockId,
      channels: ['app'],
    });

    // Notify host
    await this.createNotification({
      userId: data.hostId,
      title: 'Unlock Request Cancelled',
      message: `An unlock request for "${data.propertyName}" was cancelled by the guest.`,
      type: 'unlock',
      category: 'unlock_cancelled',
      priority: 'low',
      relatedEntityType: 'unlock',
      relatedEntityId: data.unlockId,
      channels: ['app'],
    });
  }

  async notifyDealCodeGenerated(data: {
    guestId: number;
    dealCode: string;
    remainingUnlocks: number;
    expiresAt: Date;
  }): Promise<void> {
    await this.createNotification({
      userId: data.guestId,
      title: 'Deal Code Generated',
      message: `Your deal code "${data.dealCode}" is ready! You have ${data.remainingUnlocks} free unlocks remaining.`,
      type: 'success',
      category: 'deal_code_generated',
      priority: 'high',
      actionUrl: `/my-unlocks`,
      metadata: {
        dealCode: data.dealCode,
        remainingUnlocks: data.remainingUnlocks,
        expiresAt: data.expiresAt,
      },
      channels: ['app', 'email'],
    });
  }

  async notifyUnlockBookingCreated(data: {
    guestId: number;
    hostId: number;
    bookingId: string;
    propertyName: string;
    checkIn: string;
    checkOut: string;
    totalAmount: number;
    paidAmount: number; // 30%
  }): Promise<void> {
    // Notify guest
    await this.createNotification({
      userId: data.guestId,
      title: 'Booking Created - Complete Payment',
      message: `Your booking for "${data.propertyName}" is created. Complete payment to confirm.`,
      type: 'booking',
      category: 'booking_created',
      priority: 'urgent',
      actionUrl: `/bookings/${data.bookingId}/confirm-and-pay`,
      relatedEntityType: 'booking',
      relatedEntityId: data.bookingId,
      metadata: {
        propertyName: data.propertyName,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        totalAmount: data.totalAmount,
        paidAmount: data.paidAmount,
        remainingAmount: data.totalAmount - data.paidAmount,
      },
      channels: ['app', 'email'],
    });

    // Notify host
    await this.createNotification({
      userId: data.hostId,
      title: 'New Booking Request',
      message: `New booking request for "${data.propertyName}" from ${data.checkIn} to ${data.checkOut}.`,
      type: 'booking',
      category: 'booking_created',
      priority: 'high',
      actionUrl: `/host/bookings/${data.bookingId}`,
      relatedEntityType: 'booking',
      relatedEntityId: data.bookingId,
      channels: ['app', 'email'],
    });
  }

  /**
   * Admin notification for unlock activities
   */
  async notifyAdminUnlockActivity(data: {
    adminIds: number[];
    activityType: 'new_unlock' | 'cancellation' | 'deal_code_used' | 'booking_created';
    propertyName: string;
    unlockId?: string;
    bookingId?: string;
  }): Promise<void> {
    const messages = {
      new_unlock: `New unlock request for "${data.propertyName}"`,
      cancellation: `Unlock cancelled for "${data.propertyName}"`,
      deal_code_used: `Deal code used to unlock "${data.propertyName}"`,
      booking_created: `Unlock converted to booking for "${data.propertyName}"`,
    };

    await this.createNotification({
      userId: data.adminIds,
      title: 'Unlock Activity',
      message: messages[data.activityType],
      type: 'info',
      priority: 'low',
      actionUrl: '/admin/unlock-analytics',
      relatedEntityType: data.bookingId ? 'booking' : 'unlock',
      relatedEntityId: data.bookingId || data.unlockId,
      channels: ['app'],
    });
  }

  /**
   * Get notifications for a user with filters
   */
  async getUserNotifications(
    userId: number,
    filters: NotificationFilter = {},
    page: number = 1,
    limit: number = 20
  ) {
    const where: any = { userId };

    if (filters.type) where.type = filters.type;
    if (filters.isRead !== undefined) where.isRead = filters.isRead;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [notifications, total] = await Promise.all([
      prisma.tourNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tourNotification.count({ where }),
    ]);

    return {
      notifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Mark notification(s) as read
   */
  async markAsRead(userId: number, notificationIds: string | string[]): Promise<void> {
    const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds];

    await prisma.tourNotification.updateMany({
      where: {
        id: { in: ids },
        userId,
      },
      data: {
        isRead: true,
      },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: number): Promise<void> {
    await prisma.tourNotification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: number): Promise<number> {
    return prisma.tourNotification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Delete notification(s)
   */
  async deleteNotifications(userId: number, notificationIds: string | string[]): Promise<void> {
    const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds];

    await prisma.tourNotification.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });
  }

  /**
   * Log activity for unlock operations
   */
  async logUnlockActivity(data: {
    userId: number;
    action: string;
    resourceType: 'property_unlock' | 'deal_code' | 'unlock_booking';
    resourceId: string;
    details: Record<string, any>;
    status: 'success' | 'failed' | 'pending';
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await prisma.activityLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          details: data.details,
          status: data.status,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          createdAt: new Date(),
        },
      });

      logger.info('Activity logged', 'UnifiedNotificationService', {
        userId: data.userId,
        action: data.action,
        resourceType: data.resourceType,
      });
    } catch (error) {
      logger.error('Failed to log activity', 'UnifiedNotificationService', { error, data });
      // Don't throw - activity logging shouldn't break the main flow
    }
  }
}

// Export singleton instance
export const unifiedNotificationService = new UnifiedNotificationService();
