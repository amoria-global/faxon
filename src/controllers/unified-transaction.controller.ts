// controllers/unified-transaction.controller.ts - Unified transaction API endpoints

import { Request, Response } from 'express';
import { unifiedTransactionService, UnifiedTransactionFilters } from '../services/unified-transaction.service';
import { logger } from '../utils/logger';

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
}

export const unifiedTransactionController = new UnifiedTransactionController();
