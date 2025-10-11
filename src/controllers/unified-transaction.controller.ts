// controllers/unified-transaction.controller.ts - Unified transaction API endpoints with wallet management

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { unifiedTransactionService, UnifiedTransactionFilters } from '../services/unified-transaction.service';
import { PawaPayService } from '../services/pawapay.service';
import { PAWAPAY_PROVIDERS } from '../types/pawapay.types';
import { logger } from '../utils/logger';
import config from '../config/config';

const prisma = new PrismaClient();

// Initialize PawaPay service for provider information
const pawaPayService = new PawaPayService({
  apiKey: config.pawapay.apiKey,
  baseUrl: config.pawapay.baseUrl,
  environment: config.pawapay.environment
});

export class UnifiedTransactionController {
  /**
   * Get all transactions with optional filters
   * GET /api/transactions
   */
  async getAllTransactions(req: Request, res: Response): Promise<void> {
    try {
      const filters: UnifiedTransactionFilters = {
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        recipientId: req.query.recipientId ? parseInt(req.query.recipientId as string) : undefined,
        provider: req.query.provider as any,
        type: req.query.type as any,
        status: req.query.status as string,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      logger.info('Fetching unified transactions', 'UnifiedTransactionController', { filters });

      const transactions = await unifiedTransactionService.getAllTransactions(filters);

      res.status(200).json({
        success: true,
        count: transactions.length,
        data: transactions
      });
    } catch (error: any) {
      logger.error('Failed to fetch transactions', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions',
        error: error.message
      });
    }
  }

  /**
   * Get transactions by user ID
   * GET /api/transactions/user/:userId
   */
  async getTransactionsByUserId(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
        return;
      }

      const filters: Omit<UnifiedTransactionFilters, 'userId'> = {
        provider: req.query.provider as any,
        type: req.query.type as any,
        status: req.query.status as string,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      logger.info('Fetching transactions for user', 'UnifiedTransactionController', { userId, filters });

      const transactions = await unifiedTransactionService.getTransactionsByUserId(userId, filters);

      res.status(200).json({
        success: true,
        userId,
        count: transactions.length,
        data: transactions
      });
    } catch (error: any) {
      logger.error('Failed to fetch user transactions', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user transactions',
        error: error.message
      });
    }
  }

  /**
   * Get transactions by recipient ID
   * GET /api/transactions/recipient/:recipientId
   */
  async getTransactionsByRecipientId(req: Request, res: Response): Promise<void> {
    try {
      const recipientId = parseInt(req.params.recipientId);

      if (isNaN(recipientId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid recipient ID'
        });
        return;
      }

      const filters: Omit<UnifiedTransactionFilters, 'recipientId'> = {
        provider: req.query.provider as any,
        type: req.query.type as any,
        status: req.query.status as string,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      logger.info('Fetching transactions for recipient', 'UnifiedTransactionController', { recipientId, filters });

      const transactions = await unifiedTransactionService.getTransactionsByRecipientId(recipientId, filters);

      res.status(200).json({
        success: true,
        recipientId,
        count: transactions.length,
        data: transactions
      });
    } catch (error: any) {
      logger.error('Failed to fetch recipient transactions', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recipient transactions',
        error: error.message
      });
    }
  }

  /**
   * Get single transaction by ID
   * GET /api/transactions/:id
   */
  async getTransactionById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const provider = req.query.provider as any;

      logger.info('Fetching transaction by ID', 'UnifiedTransactionController', { id, provider });

      const transaction = await unifiedTransactionService.getTransactionById(id, provider);

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: transaction
      });
    } catch (error: any) {
      logger.error('Failed to fetch transaction', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction',
        error: error.message
      });
    }
  }

  /**
   * Get transaction statistics
   * GET /api/transactions/stats
   */
  async getTransactionStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

      logger.info('Fetching transaction statistics', 'UnifiedTransactionController', { userId });

      const stats = await unifiedTransactionService.getTransactionStats(userId);

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('Failed to fetch transaction stats', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction statistics',
        error: error.message
      });
    }
  }

  // ==================== WALLET & BALANCE ====================

  /**
   * Get user wallet balance and information
   * GET /api/transactions/wallet/:userId
   */
  async getUserWallet(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      const wallet = await prisma.wallet.findUnique({
        where: { userId },
        select: {
          id: true,
          userId: true,
          balance: true,
          pendingBalance: true,
          currency: true,
          walletNumber: true,
          accountNumber: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!wallet) {
        res.status(404).json({ success: false, message: 'Wallet not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          ...wallet,
          totalBalance: wallet.balance + wallet.pendingBalance,
          availableBalance: wallet.balance
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch wallet', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch wallet', error: error.message });
    }
  }

  /**
   * Get wallet transaction history
   * GET /api/transactions/wallet/:userId/history
   */
  async getWalletHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      // First get the wallet
      const wallet = await prisma.wallet.findUnique({ where: { userId } });

      if (!wallet) {
        res.status(404).json({ success: false, message: 'Wallet not found' });
        return;
      }

      const history = await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          reference: true,
          description: true,
          createdAt: true
        }
      });

      const total = await prisma.walletTransaction.count({ where: { walletId: wallet.id } });

      res.status(200).json({
        success: true,
        data: history,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch wallet history', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch wallet history', error: error.message });
    }
  }

  // ==================== WITHDRAWAL METHODS ====================

  /**
   * Get available PawaPay withdrawal methods for a country
   * GET /api/transactions/withdrawal-methods/available?country=RWA
   */
  async getAvailableWithdrawalMethods(req: Request, res: Response): Promise<void> {
    try {
      const countryCode = (req.query.country as string || 'RWA').toUpperCase();

      logger.info('Fetching available withdrawal methods', 'UnifiedTransactionController', { countryCode });

      let formattedProviders: any[] = [];

      try {
        // Try to get active providers from PawaPay
        const providers = await pawaPayService.getAvailableProviders(countryCode);

        if (providers && providers.length > 0) {
          formattedProviders = providers.map(provider => ({
            code: provider.correspondent,
            name: provider.correspondent.replace(/_/g, ' '),
            country: provider.country,
            currency: provider.currency,
            active: provider.active,
            supportsDeposits: true,
            supportsPayouts: true
          }));
        }
      } catch (pawaPayError) {
        logger.warn('PawaPay API unavailable, using static providers', 'UnifiedTransactionController', pawaPayError);
      }

      res.status(200).json({
        success: true,
        country: countryCode,
        count: formattedProviders.length,
        data: formattedProviders,
        source: formattedProviders.length > 0 ? 'pawapay' : 'static'
      });
    } catch (error: any) {
      logger.error('Failed to fetch available withdrawal methods', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch available withdrawal methods',
        error: error.message
      });
    }
  }

  /**
   * Get Rwanda-specific withdrawal providers (optimized for Rwanda)
   * GET /api/transactions/withdrawal-methods/rwanda
   */
  async getRwandaWithdrawalMethods(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching Rwanda withdrawal methods', 'UnifiedTransactionController');

      // Rwanda mobile money providers from PawaPay
      const rwandaProviders = [
        {
          id: 'mtn_rwanda',
          code: PAWAPAY_PROVIDERS.MTN_RWANDA,
          name: 'MTN Mobile Money',
          shortName: 'MTN MoMo',
          provider: 'MTN',
          country: 'RWA',
          countryName: 'Rwanda',
          currency: 'RWF',
          logo: 'https://www.mtn.co.rw/wp-content/uploads/2021/01/mtn-logo.png',
          color: '#FFCB05',
          active: true,
          supportsDeposits: true,
          supportsPayouts: true,
          accountFormat: {
            label: 'MTN Mobile Money Number',
            placeholder: '078XXXXXXX or 079XXXXXXX',
            pattern: '^(078|079)[0-9]{7}$',
            example: '0788123456'
          },
          fees: {
            withdrawalFee: '0%',
            note: 'Fees may apply based on transaction amount'
          }
        },
        {
          id: 'airtel_rwanda',
          code: PAWAPAY_PROVIDERS.AIRTEL_RWANDA,
          name: 'Airtel Money',
          shortName: 'Airtel',
          provider: 'Airtel',
          country: 'RWA',
          countryName: 'Rwanda',
          currency: 'RWF',
          logo: 'https://www.airtel.in/static-assets/new-home/img/brand-logo.png',
          color: '#ED1C24',
          active: true,
          supportsDeposits: true,
          supportsPayouts: true,
          accountFormat: {
            label: 'Airtel Money Number',
            placeholder: '073XXXXXXX',
            pattern: '^(073)[0-9]{7}$',
            example: '0731234567'
          },
          fees: {
            withdrawalFee: '0%',
            note: 'Fees may apply based on transaction amount'
          }
        }
      ];

      res.status(200).json({
        success: true,
        country: 'RWA',
        countryName: 'Rwanda',
        currency: 'RWF',
        count: rwandaProviders.length,
        data: rwandaProviders,
        info: {
          supportedProviders: ['MTN Mobile Money', 'Airtel Money'],
          processingTime: 'Instant to few minutes',
          availability: '24/7',
          note: 'All mobile money withdrawals are processed through PawaPay'
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch Rwanda withdrawal methods', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Rwanda withdrawal methods',
        error: error.message
      });
    }
  }

  /**
   * Get user's saved withdrawal methods
   * GET /api/transactions/withdrawal-methods/:userId
   * Query params: ?approved=true (filter by approval status)
   */
  async getWithdrawalMethods(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);
      const approvedOnly = req.query.approved === 'true';

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      // Build where clause - optionally filter by approval status
      const whereClause: any = { userId };
      if (approvedOnly) {
        whereClause.isApproved = true;
      }

      const methods = await prisma.withdrawalMethod.findMany({
        where: whereClause,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          userId: true,
          methodType: true,
          accountName: true,
          accountDetails: true,
          isDefault: true,
          isVerified: true,
          isApproved: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Categorize methods
      const approved = methods.filter(m => m.isApproved);
      const pending = methods.filter(m => !m.isApproved && m.verificationStatus === 'pending');
      const rejected = methods.filter(m => !m.isApproved && m.verificationStatus === 'rejected');

      res.status(200).json({
        success: true,
        count: methods.length,
        data: methods,
        summary: {
          total: methods.length,
          approved: approved.length,
          pending: pending.length,
          rejected: rejected.length,
          hasDefault: methods.some(m => m.isDefault)
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch withdrawal methods', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch withdrawal methods', error: error.message });
    }
  }

  /**
   * Add a new withdrawal method
   * POST /api/transactions/withdrawal-methods
   */
  async addWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const { userId, methodType, accountName, accountDetails, isDefault } = req.body;

      if (!userId || !methodType || !accountName || !accountDetails) {
        res.status(400).json({ success: false, message: 'Missing required fields: userId, methodType, accountName, accountDetails' });
        return;
      }

      // If setting as default, unset other defaults first
      if (isDefault) {
        await prisma.withdrawalMethod.updateMany({
          where: { userId: parseInt(userId), isDefault: true },
          data: { isDefault: false }
        });
      }

      const method = await prisma.withdrawalMethod.create({
        data: {
          userId: parseInt(userId),
          methodType,
          accountName,
          accountDetails,
          isDefault: isDefault || false,
          isVerified: false,
          isApproved: false,
          verificationStatus: 'pending'
        }
      });

      logger.info('Withdrawal method added', 'UnifiedTransactionController', { userId, methodId: method.id, methodType });

      res.status(201).json({
        success: true,
        message: 'Withdrawal method added successfully (pending approval)',
        data: method
      });
    } catch (error: any) {
      logger.error('Failed to add withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to add withdrawal method', error: error.message });
    }
  }

  /**
   * Update withdrawal method
   * PUT /api/transactions/withdrawal-methods/:id
   */
  async updateWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const { accountName, accountDetails } = req.body;

      const method = await prisma.withdrawalMethod.update({
        where: { id },
        data: {
          accountName: accountName || undefined,
          accountDetails: accountDetails || undefined,
          verificationStatus: 'pending', // Re-verify after update
          isVerified: false,
          updatedAt: new Date()
        }
      });

      res.status(200).json({
        success: true,
        message: 'Withdrawal method updated successfully (requires re-verification)',
        data: method
      });
    } catch (error: any) {
      logger.error('Failed to update withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to update withdrawal method', error: error.message });
    }
  }

  /**
   * Delete withdrawal method
   * DELETE /api/transactions/withdrawal-methods/:id
   */
  async deleteWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;

      await prisma.withdrawalMethod.delete({
        where: { id }
      });

      res.status(200).json({
        success: true,
        message: 'Withdrawal method deleted successfully'
      });
    } catch (error: any) {
      logger.error('Failed to delete withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to delete withdrawal method', error: error.message });
    }
  }

  /**
   * Set default withdrawal method
   * PUT /api/transactions/withdrawal-methods/:id/set-default
   */
  async setDefaultWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;

      const method = await prisma.withdrawalMethod.findUnique({ where: { id } });

      if (!method) {
        res.status(404).json({ success: false, message: 'Withdrawal method not found' });
        return;
      }

      // Unset all other defaults for this user
      await prisma.withdrawalMethod.updateMany({
        where: { userId: method.userId, isDefault: true },
        data: { isDefault: false }
      });

      // Set this as default
      const updated = await prisma.withdrawalMethod.update({
        where: { id },
        data: { isDefault: true, updatedAt: new Date() }
      });

      res.status(200).json({
        success: true,
        message: 'Default withdrawal method updated successfully',
        data: updated
      });
    } catch (error: any) {
      logger.error('Failed to set default withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to set default withdrawal method', error: error.message });
    }
  }

  // ==================== ADMIN: WITHDRAWAL METHOD APPROVAL ====================

  /**
   * Get all pending withdrawal methods (admin only)
   * GET /api/transactions/withdrawal-methods/pending/all
   */
  async getPendingWithdrawalMethods(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      logger.info('Fetching pending withdrawal methods', 'UnifiedTransactionController', { limit, offset });

      const methods = await prisma.withdrawalMethod.findMany({
        where: {
          verificationStatus: 'pending',
          isApproved: false
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              kycStatus: true
            }
          }
        }
      });

      const total = await prisma.withdrawalMethod.count({
        where: {
          verificationStatus: 'pending',
          isApproved: false
        }
      });

      res.status(200).json({
        success: true,
        count: methods.length,
        total,
        data: methods,
        pagination: {
          limit,
          offset,
          hasMore: offset + limit < total
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch pending withdrawal methods', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch pending withdrawal methods', error: error.message });
    }
  }

  /**
   * Approve a withdrawal method (admin only)
   * POST /api/transactions/withdrawal-methods/:id/approve
   */
  async approveWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const { adminId } = req.body;

      if (!adminId) {
        res.status(400).json({ success: false, message: 'Admin ID is required' });
        return;
      }

      const method = await prisma.withdrawalMethod.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!method) {
        res.status(404).json({ success: false, message: 'Withdrawal method not found' });
        return;
      }

      if (method.isApproved) {
        res.status(400).json({ success: false, message: 'Withdrawal method is already approved' });
        return;
      }

      const updated = await prisma.withdrawalMethod.update({
        where: { id },
        data: {
          isApproved: true,
          isVerified: true,
          verificationStatus: 'verified',
          approvedBy: parseInt(adminId),
          approvedAt: new Date(),
          updatedAt: new Date()
        }
      });

      logger.info('Withdrawal method approved', 'UnifiedTransactionController', {
        methodId: id,
        userId: method.userId,
        adminId
      });

      res.status(200).json({
        success: true,
        message: `Withdrawal method approved successfully for ${method.user.firstName} ${method.user.lastName}`,
        data: updated
      });
    } catch (error: any) {
      logger.error('Failed to approve withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to approve withdrawal method', error: error.message });
    }
  }

  /**
   * Reject a withdrawal method (admin only)
   * POST /api/transactions/withdrawal-methods/:id/reject
   */
  async rejectWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const { adminId, reason } = req.body;

      if (!adminId) {
        res.status(400).json({ success: false, message: 'Admin ID is required' });
        return;
      }

      if (!reason) {
        res.status(400).json({ success: false, message: 'Rejection reason is required' });
        return;
      }

      const method = await prisma.withdrawalMethod.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!method) {
        res.status(404).json({ success: false, message: 'Withdrawal method not found' });
        return;
      }

      const updated = await prisma.withdrawalMethod.update({
        where: { id },
        data: {
          isApproved: false,
          isVerified: false,
          verificationStatus: 'rejected',
          rejectedBy: parseInt(adminId),
          rejectedAt: new Date(),
          rejectionReason: reason,
          updatedAt: new Date()
        }
      });

      logger.info('Withdrawal method rejected', 'UnifiedTransactionController', {
        methodId: id,
        userId: method.userId,
        adminId,
        reason
      });

      res.status(200).json({
        success: true,
        message: `Withdrawal method rejected for ${method.user.firstName} ${method.user.lastName}`,
        data: updated
      });
    } catch (error: any) {
      logger.error('Failed to reject withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to reject withdrawal method', error: error.message });
    }
  }

  // ==================== ACCOUNT INFORMATION ====================

  /**
   * Get user account information (wallet + withdrawal methods + basic info)
   * GET /api/transactions/account/:userId
   */
  async getAccountInfo(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      // Fetch user info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          kycStatus: true
        }
      });

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      // Fetch wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
        select: {
          balance: true,
          pendingBalance: true,
          currency: true,
          walletNumber: true
        }
      });

      // Fetch withdrawal methods (all, not just approved)
      const withdrawalMethods = await prisma.withdrawalMethod.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          methodType: true,
          accountName: true,
          accountDetails: true,
          isDefault: true,
          isVerified: true,
          isApproved: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Categorize methods
      const approvedMethods = withdrawalMethods.filter(m => m.isApproved);
      const pendingMethods = withdrawalMethods.filter(m => !m.isApproved && m.verificationStatus === 'pending');

      res.status(200).json({
        success: true,
        data: {
          user,
          wallet: wallet ? {
            ...wallet,
            totalBalance: wallet.balance + wallet.pendingBalance,
            availableBalance: wallet.balance
          } : null,
          withdrawalMethods,
          stats: {
            totalWithdrawalMethods: withdrawalMethods.length,
            approvedMethods: approvedMethods.length,
            pendingMethods: pendingMethods.length,
            hasDefaultMethod: withdrawalMethods.some(m => m.isDefault),
            verifiedMethods: withdrawalMethods.filter(m => m.isVerified).length
          }
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch account info', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch account info', error: error.message });
    }
  }
}

export const unifiedTransactionController = new UnifiedTransactionController();
