// services/withdrawal-notification.service.ts
// Comprehensive withdrawal notification service for user and admin notifications

import { PrismaClient } from '@prisma/client';
import { BrevoMailingService } from '../utils/brevo.admin';
import smsService from './sms.service';

const prisma = new PrismaClient();
const brevoService = new BrevoMailingService();

interface WithdrawalNotificationData {
  withdrawalId: string;
  userId: number;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  userPhone?: string | null;
  amount: number;
  currency: string;
  method: string;
  status: 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'EXPIRED';
  reference: string;
  destination?: any;
  failureReason?: string | null;
  adminNotes?: string | null;
}

export class WithdrawalNotificationService {
  private readonly ADMIN_EMAIL = 'admin@amoriaglobal.com';
  private readonly COMPANY_INFO = {
    name: 'Jambolush',
    website: 'https://jambolush.com',
    supportEmail: 'support@jambolush.com',
    logo: 'https://jambolush.com/favicon.ico'
  };

  /**
   * Send notification for withdrawal request created (PENDING)
   */
  async notifyWithdrawalRequested(data: WithdrawalNotificationData): Promise<void> {
    try {
      console.log(`[WITHDRAWAL_NOTIFICATION] Sending PENDING notification for ${data.reference}`);

      // Send email to user
      await this.sendUserEmail({
        ...data,
        title: 'Withdrawal Request Received',
        message: `Your withdrawal request of ${data.amount.toLocaleString()} ${data.currency} has been received and is awaiting approval.`,
        statusMessage: 'Pending Approval',
        statusColor: '#FFA500', // Orange
        nextSteps: [
          'Our team will review your request shortly',
          'You will receive a notification once your request is approved or if additional information is needed',
          'Estimated review time: 1-24 hours'
        ]
      });

      // Send SMS to user
      if (data.userPhone) {
        await this.sendUserSMS(data, 'pending');
      }

      // Send notification to admin
      await this.sendAdminNotification({
        ...data,
        title: 'New Withdrawal Request',
        severity: 'medium'
      });

      console.log(`[WITHDRAWAL_NOTIFICATION] ✅ PENDING notifications sent for ${data.reference}`);
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] Error sending PENDING notifications:', error);
    }
  }

  /**
   * Send notification for withdrawal approved by admin (APPROVED)
   */
  async notifyWithdrawalApproved(data: WithdrawalNotificationData): Promise<void> {
    try {
      console.log(`[WITHDRAWAL_NOTIFICATION] Sending APPROVED notification for ${data.reference}`);

      // Get method-specific details
      const methodDetails = this.getMethodDetails(data.method);

      // Send email to user using Brevo template
      await brevoService.sendUserWithdrawalApproved({
        user: {
          id: data.userId,
          firstName: data.userFirstName,
          lastName: data.userLastName,
          email: data.userEmail
        },
        company: this.COMPANY_INFO,
        action: {
          type: 'withdrawal_approved',
          title: 'Withdrawal Request Approved',
          message: `Your withdrawal request has been approved and is being processed.`,
          timestamp: new Date().toISOString(),
          details: {
            amount: data.amount,
            currency: data.currency,
            method: methodDetails.displayName,
            accountName: data.destination?.holderName || data.destination?.accountName,
            providerName: data.destination?.providerName || data.destination?.mobileProvider,
            approvedAt: new Date().toISOString(),
            reference: data.reference,
            estimatedTime: methodDetails.estimatedTime,
            nextSteps: methodDetails.nextSteps
          }
        }
      });

      // Send SMS to user
      if (data.userPhone) {
        await this.sendUserSMS(data, 'approved');
      }

      // Send notification to admin
      await this.sendAdminNotification({
        ...data,
        title: 'Withdrawal Approved & Processing',
        severity: 'low'
      });

      console.log(`[WITHDRAWAL_NOTIFICATION] ✅ APPROVED notifications sent for ${data.reference}`);
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] ❌ Error sending APPROVED notifications:', error);
      // Re-throw to allow caller to handle
      throw error;
    }
  }

  /**
   * Send notification for withdrawal completed (COMPLETED)
   */
  async notifyWithdrawalCompleted(data: WithdrawalNotificationData): Promise<void> {
    try {
      console.log(`[WITHDRAWAL_NOTIFICATION] Sending COMPLETED notification for ${data.reference}`);

      // Send email to user
      await this.sendUserEmail({
        ...data,
        title: 'Withdrawal Completed',
        message: `Your withdrawal of ${data.amount.toLocaleString()} ${data.currency} has been successfully completed.`,
        statusMessage: 'Completed Successfully',
        statusColor: '#4CAF50', // Green
        nextSteps: [
          'The funds have been transferred to your account',
          'Please check your account balance',
          'It may take a few minutes for the funds to reflect in your account',
          'If you have any questions, contact our support team'
        ],
        showConfetti: true
      });

      // Send SMS to user
      if (data.userPhone) {
        await this.sendUserSMS(data, 'completed');
      }

      // Send notification to admin
      await this.sendAdminNotification({
        ...data,
        title: 'Withdrawal Completed',
        severity: 'low'
      });

      console.log(`[WITHDRAWAL_NOTIFICATION] ✅ COMPLETED notifications sent for ${data.reference}`);
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] Error sending COMPLETED notifications:', error);
    }
  }

  /**
   * Send notification for withdrawal failed (FAILED)
   */
  async notifyWithdrawalFailed(data: WithdrawalNotificationData): Promise<void> {
    try {
      console.log(`[WITHDRAWAL_NOTIFICATION] Sending FAILED notification for ${data.reference}`);

      // Send email to user
      await this.sendUserEmail({
        ...data,
        title: 'Withdrawal Failed - Funds Refunded',
        message: `Your withdrawal request of ${data.amount.toLocaleString()} ${data.currency} could not be completed.`,
        statusMessage: 'Failed - Funds Refunded',
        statusColor: '#F44336', // Red
        nextSteps: [
          'The funds have been refunded to your wallet',
          'Your wallet balance has been restored',
          `Reason: ${data.failureReason || 'Payment processing failed'}`,
          'You can submit a new withdrawal request',
          'If you need assistance, please contact our support team'
        ],
        isFailure: true
      });

      // Send SMS to user
      if (data.userPhone) {
        await this.sendUserSMS(data, 'failed');
      }

      // Send notification to admin
      await this.sendAdminNotification({
        ...data,
        title: 'Withdrawal Failed - Refunded',
        severity: 'high'
      });

      console.log(`[WITHDRAWAL_NOTIFICATION] ✅ FAILED notifications sent for ${data.reference}`);
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] Error sending FAILED notifications:', error);
    }
  }

  /**
   * Send notification for withdrawal rejected by admin (REJECTED)
   */
  async notifyWithdrawalRejected(data: WithdrawalNotificationData): Promise<void> {
    try {
      console.log(`[WITHDRAWAL_NOTIFICATION] Sending REJECTED notification for ${data.reference}`);

      // Send email to user using Brevo template
      await brevoService.sendUserWithdrawalRejected({
        user: {
          id: data.userId,
          firstName: data.userFirstName,
          lastName: data.userLastName,
          email: data.userEmail
        },
        company: this.COMPANY_INFO,
        action: {
          type: 'withdrawal_rejected',
          title: 'Withdrawal Request Update Required',
          message: `Your withdrawal request of ${data.amount.toLocaleString()} ${data.currency} requires attention.`,
          timestamp: new Date().toISOString(),
          reason: data.failureReason || 'Please contact support for more information',
          details: {
            amount: data.amount,
            currency: data.currency,
            reference: data.reference,
            rejectedAt: new Date().toISOString()
          }
        }
      });

      // Send SMS to user
      if (data.userPhone) {
        await this.sendUserSMS(data, 'rejected');
      }

      // Send notification to admin
      await this.sendAdminNotification({
        ...data,
        title: 'Withdrawal Rejected',
        severity: 'medium'
      });

      console.log(`[WITHDRAWAL_NOTIFICATION] ✅ REJECTED notifications sent for ${data.reference}`);
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] ❌ Error sending REJECTED notifications:', error);
      // Re-throw to allow caller to handle
      throw error;
    }
  }

  /**
   * Send notification for withdrawal expired (EXPIRED - 24 hours in APPROVED state)
   */
  async notifyWithdrawalExpired(data: WithdrawalNotificationData): Promise<void> {
    try {
      console.log(`[WITHDRAWAL_NOTIFICATION] Sending EXPIRED notification for ${data.reference}`);

      // Send email to user
      await this.sendUserEmail({
        ...data,
        title: 'Withdrawal Request Expired',
        message: `Your withdrawal request of ${data.amount.toLocaleString()} ${data.currency} has expired.`,
        statusMessage: 'Expired - Funds Refunded',
        statusColor: '#FF9800', // Orange
        nextSteps: [
          'Your withdrawal request expired after 24 hours without processing',
          'The funds have been refunded to your wallet',
          'Your wallet balance has been restored',
          'You can submit a new withdrawal request',
          'If you need assistance, please contact our support team'
        ],
        isFailure: true
      });

      // Send SMS to user
      if (data.userPhone) {
        await this.sendUserSMS(data, 'expired');
      }

      // Send notification to admin
      await this.sendAdminNotification({
        ...data,
        title: 'Withdrawal Expired - Refunded',
        severity: 'medium'
      });

      console.log(`[WITHDRAWAL_NOTIFICATION] ✅ EXPIRED notifications sent for ${data.reference}`);
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] Error sending EXPIRED notifications:', error);
    }
  }

  /**
   * Send user email notification
   */
  private async sendUserEmail(params: WithdrawalNotificationData & {
    title: string;
    message: string;
    statusMessage: string;
    statusColor: string;
    nextSteps: string[];
    showConfetti?: boolean;
    isFailure?: boolean;
  }): Promise<void> {
    try {
      // Use Brevo API to send email
      // For now, just log - you can implement the actual email sending using Brevo templates
      console.log(`[WITHDRAWAL_NOTIFICATION] Email to user:`, {
        to: params.userEmail,
        subject: params.title,
        data: {
          firstName: params.userFirstName,
          amount: params.amount,
          currency: params.currency,
          reference: params.reference,
          status: params.statusMessage
        }
      });

      // TODO: Implement actual email sending using Brevo
      // await brevoService.sendTransactionalEmail({...});
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] Error sending user email:', error);
      throw error;
    }
  }

  /**
   * Send SMS notification to user
   */
  private async sendUserSMS(data: WithdrawalNotificationData, status: string): Promise<void> {
    try {
      if (!data.userPhone) {
        return;
      }

      await smsService.sendTransactionStatusSMS(
        data.userId,
        data.userPhone,
        'withdrawal',
        data.amount,
        data.currency,
        status
      );

      console.log(`[WITHDRAWAL_NOTIFICATION] SMS sent to ${data.userPhone}`);
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] Error sending SMS:', error);
      // Don't throw - SMS is not critical
    }
  }

  /**
   * Send admin notification
   */
  private async sendAdminNotification(params: WithdrawalNotificationData & {
    title: string;
    severity: 'low' | 'medium' | 'high';
  }): Promise<void> {
    try {
      console.log(`[ADMIN_NOTIFICATION] ${params.title}:`, {
        withdrawalId: params.withdrawalId,
        userId: params.userId,
        userName: `${params.userFirstName} ${params.userLastName}`,
        userEmail: params.userEmail,
        amount: params.amount,
        currency: params.currency,
        method: params.method,
        status: params.status,
        reference: params.reference,
        failureReason: params.failureReason
      });

      // TODO: Implement actual admin email notification using Brevo
      // await brevoService.sendAdminEmail({...});
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] Error sending admin notification:', error);
      // Don't throw - admin notification is not critical
    }
  }

  /**
   * Get method-specific display details
   */
  private getMethodDetails(method: string): {
    displayName: string;
    estimatedTime: string;
    nextSteps: string;
  } {
    const methodMap: Record<string, any> = {
      'MOBILE': {
        displayName: 'Mobile Money',
        estimatedTime: '5-15 minutes',
        nextSteps: 'You will receive the funds in your mobile money account shortly'
      },
      'MOBILE_MONEY': {
        displayName: 'Mobile Money',
        estimatedTime: '5-15 minutes',
        nextSteps: 'You will receive the funds in your mobile money account shortly'
      },
      'BANK': {
        displayName: 'Bank Transfer',
        estimatedTime: '1-3 business days',
        nextSteps: 'The funds will be transferred to your bank account within 1-3 business days'
      },
      'BANK_TRANSFER': {
        displayName: 'Bank Transfer',
        estimatedTime: '1-3 business days',
        nextSteps: 'The funds will be transferred to your bank account within 1-3 business days'
      }
    };

    return methodMap[method.toUpperCase()] || {
      displayName: method,
      estimatedTime: '1-3 business days',
      nextSteps: 'You will receive the funds shortly'
    };
  }

  /**
   * Helper method to get withdrawal data and send appropriate notification
   */
  async notifyWithdrawalStatusChange(
    withdrawalId: string,
    newStatus: 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'EXPIRED'
  ): Promise<void> {
    try {
      // Get withdrawal data
      const withdrawal = await prisma.withdrawalRequest.findUnique({
        where: { id: withdrawalId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true
            }
          }
        }
      });

      if (!withdrawal) {
        console.error(`[WITHDRAWAL_NOTIFICATION] Withdrawal ${withdrawalId} not found`);
        return;
      }

      // Parse destination
      let destination: any = {};
      try {
        destination = typeof withdrawal.destination === 'string'
          ? JSON.parse(withdrawal.destination)
          : withdrawal.destination;
      } catch (error) {
        destination = withdrawal.destination;
      }

      const notificationData: WithdrawalNotificationData = {
        withdrawalId: withdrawal.id,
        userId: withdrawal.userId,
        userEmail: withdrawal.user.email,
        userFirstName: withdrawal.user.firstName || 'User',
        userLastName: withdrawal.user.lastName || '',
        userPhone: withdrawal.user.phone,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        method: withdrawal.method,
        status: newStatus,
        reference: withdrawal.reference,
        destination,
        failureReason: withdrawal.failureReason,
        adminNotes: withdrawal.adminNotes
      };

      // Send appropriate notification based on status
      switch (newStatus) {
        case 'PENDING':
          await this.notifyWithdrawalRequested(notificationData);
          break;
        case 'APPROVED':
          await this.notifyWithdrawalApproved(notificationData);
          break;
        case 'COMPLETED':
          await this.notifyWithdrawalCompleted(notificationData);
          break;
        case 'FAILED':
          await this.notifyWithdrawalFailed(notificationData);
          break;
        case 'REJECTED':
          await this.notifyWithdrawalRejected(notificationData);
          break;
        case 'EXPIRED':
          await this.notifyWithdrawalExpired(notificationData);
          break;
        default:
          console.log(`[WITHDRAWAL_NOTIFICATION] No notification configured for status: ${newStatus}`);
      }
    } catch (error: any) {
      console.error('[WITHDRAWAL_NOTIFICATION] Error in notifyWithdrawalStatusChange:', error);
    }
  }
}

export const withdrawalNotificationService = new WithdrawalNotificationService();
export default withdrawalNotificationService;
