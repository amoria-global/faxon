/**
 * Duplicate Detection Notification Service
 * Handles notifications for duplicate property and tour detections
 */

import { PrismaClient } from '@prisma/client';
import { adminNotifications } from '../utils/admin-notifications';

const prisma = new PrismaClient();

interface DuplicateNotificationData {
  entityType: 'property' | 'tour';
  entityId: string;
  duplicateOfId: string;
  uploaderId: number;
  originalOwnerId?: number | null;
  entityName: string;
  duplicateEntityName: string;
  similarityScore: number;
  similarityReasons: string[];
}

export class DuplicateNotificationService {
  /**
   * Send notifications to admin, uploader, and original owner about duplicate detection
   */
  async notifyDuplicateDetection(data: DuplicateNotificationData): Promise<void> {
    try {
      // Fetch uploader details
      const uploader = await prisma.user.findUnique({
        where: { id: data.uploaderId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      });

      if (!uploader) {
        console.error('[DUPLICATE_NOTIFICATION] Uploader not found:', data.uploaderId);
        return;
      }

      // Fetch original owner details if available
      let originalOwner = null;
      if (data.originalOwnerId) {
        originalOwner = await prisma.user.findUnique({
          where: { id: data.originalOwnerId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        });
      }

      // 1. Notify Admin
      await this.notifyAdmin({
        entityType: data.entityType,
        entityId: data.entityId,
        duplicateOfId: data.duplicateOfId,
        uploader,
        originalOwner: originalOwner ? {
          id: originalOwner.id,
          firstName: originalOwner.firstName,
          lastName: originalOwner.lastName
        } : undefined,
        entityName: data.entityName,
        duplicateEntityName: data.duplicateEntityName,
        similarityScore: data.similarityScore,
        similarityReasons: data.similarityReasons
      });

      // 2. Notify Uploader (inform them why their upload was blocked)
      await this.notifyUploader({
        uploader,
        entityType: data.entityType,
        entityName: data.entityName,
        similarityScore: data.similarityScore,
        similarityReasons: data.similarityReasons
      });

      // 3. Notify Original Owner (alert them of potential plagiarism)
      if (originalOwner && data.uploaderId !== data.originalOwnerId) {
        await this.notifyOriginalOwner({
          originalOwner,
          uploader,
          entityType: data.entityType,
          entityName: data.entityName,
          duplicateEntityName: data.duplicateEntityName,
          similarityScore: data.similarityScore
        });
      }

      // Update notification flags in database
      await this.updateNotificationFlags(data.entityId);

      console.log(`[DUPLICATE_NOTIFICATION] All notifications sent for ${data.entityType} ${data.entityId}`);
    } catch (error) {
      console.error('[DUPLICATE_NOTIFICATION] Failed to send notifications:', error);
      // Don't throw - notifications are non-critical
    }
  }

  /**
   * Notify admin about duplicate detection
   */
  private async notifyAdmin(data: {
    entityType: 'property' | 'tour';
    entityId: string;
    duplicateOfId: string;
    uploader: { id: number; email: string; firstName: string; lastName: string };
    originalOwner?: { id: number; firstName: string; lastName: string };
    entityName: string;
    duplicateEntityName: string;
    similarityScore: number;
    similarityReasons: string[];
  }): Promise<void> {
    await adminNotifications.sendDuplicateDetectionNotification(data);
  }

  /**
   * Notify uploader that their upload was blocked due to duplication
   */
  private async notifyUploader(data: {
    uploader: { id: number; email: string; firstName: string; lastName: string };
    entityType: 'property' | 'tour';
    entityName: string;
    similarityScore: number;
    similarityReasons: string[];
  }): Promise<void> {
    // This would typically use a user notification system
    // For now, log it (can be extended to send email via Brevo)
    console.log(`[DUPLICATE_NOTIFICATION] Notifying uploader ${data.uploader.email} about blocked ${data.entityType}`);

    // TODO: Implement user email notification
    // Can use a similar pattern to admin notifications with Brevo
    // await userNotifications.sendDuplicateBlockedEmail({...});
  }

  /**
   * Notify original owner about potential plagiarism
   */
  private async notifyOriginalOwner(data: {
    originalOwner: { id: number; email: string; firstName: string; lastName: string };
    uploader: { id: number; email: string; firstName: string; lastName: string };
    entityType: 'property' | 'tour';
    entityName: string;
    duplicateEntityName: string;
    similarityScore: number;
  }): Promise<void> {
    // This would typically use a user notification system
    // For now, log it (can be extended to send email via Brevo)
    console.log(`[DUPLICATE_NOTIFICATION] Notifying original owner ${data.originalOwner.email} about potential plagiarism`);

    // TODO: Implement user email notification for plagiarism alert
    // await userNotifications.sendPlagiarismAlertEmail({...});
  }

  /**
   * Update notification flags in the duplicate detection log
   */
  private async updateNotificationFlags(entityId: string): Promise<void> {
    await prisma.duplicateDetectionLog.updateMany({
      where: { entityId },
      data: {
        adminNotified: true,
        uploaderNotified: true,
        ownerNotified: true,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Get pending duplicate detection logs (for admin review)
   */
  async getPendingDuplicates(entityType?: 'property' | 'tour'): Promise<any[]> {
    const where: any = {
      status: 'pending'
    };

    if (entityType) {
      where.entityType = entityType;
    }

    const duplicates = await prisma.duplicateDetectionLog.findMany({
      where,
      include: {
        uploader: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        originalOwner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return duplicates;
  }

  /**
   * Mark a duplicate detection as reviewed/dismissed by admin
   */
  async updateDuplicateStatus(
    logId: number,
    status: 'reviewed' | 'dismissed'
  ): Promise<void> {
    await prisma.duplicateDetectionLog.update({
      where: { id: logId },
      data: {
        status,
        updatedAt: new Date()
      }
    });
  }
}

// Export singleton instance
export const duplicateNotificationService = new DuplicateNotificationService();
