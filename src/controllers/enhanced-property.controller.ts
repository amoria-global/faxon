// Enhanced Property Controller with Transaction Monitoring
import { Request, Response } from 'express';
import { EnhancedPropertyService } from '../services/enhanced-property.service';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export class EnhancedPropertyController {
  private enhancedPropertyService: EnhancedPropertyService;

  constructor() {
    this.enhancedPropertyService = new EnhancedPropertyService();
  }

  // === ENHANCED AGENT DASHBOARD WITH TRANSACTIONS ===
  getAgentDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const dashboard = await this.enhancedPropertyService.getAgentDashboardWithTransactions(agentId);
      
      res.json({
        success: true,
        message: 'Enhanced agent dashboard retrieved successfully',
        data: dashboard
      });
    } catch (error: any) {
      console.error('Error fetching enhanced agent dashboard:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve enhanced dashboard'
      });
    }
  };

  // === AGENT EARNINGS WITH TRANSACTION BREAKDOWN ===
  getAgentEarningsWithTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const timeRange = (req.query.timeRange as 'week' | 'month' | 'quarter' | 'year') || 'month';

      const earnings = await this.enhancedPropertyService.getAgentEarningsWithTransactions(agentId, timeRange);
      
      res.json({
        success: true,
        message: 'Agent earnings with transactions retrieved successfully',
        data: earnings
      });
    } catch (error: any) {
      console.error('Error fetching agent earnings with transactions:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve earnings'
      });
    }
  };

  // === TRANSACTION MONITORING DASHBOARD ===
  getTransactionMonitoringDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const monitoringData = await this.enhancedPropertyService.getTransactionMonitoringDashboard(agentId);
      
      res.json({
        success: true,
        message: 'Transaction monitoring dashboard retrieved successfully',
        data: monitoringData
      });
    } catch (error: any) {
      console.error('Error fetching transaction monitoring dashboard:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve monitoring data'
      });
    }
  };

  // === PAYMENT TRANSACTIONS ===
  getAgentPaymentTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;

      const paymentTransactions = await this.enhancedPropertyService.getAgentPaymentTransactions(agentId);
      
      // Apply filters if provided
      let filteredTransactions = paymentTransactions;
      if (status) {
        filteredTransactions = paymentTransactions.filter(t => t.status === status);
      }

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

      res.json({
        success: true,
        message: 'Payment transactions retrieved successfully',
        data: {
          transactions: paginatedTransactions,
          total: filteredTransactions.length,
          page,
          limit,
          totalPages: Math.ceil(filteredTransactions.length / limit),
          hasNext: endIndex < filteredTransactions.length,
          hasPrevious: page > 1
        }
      });
    } catch (error: any) {
      console.error('Error fetching payment transactions:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve payment transactions'
      });
    }
  };

  // === TRANSACTION SUMMARY ===
  getAgentTransactionSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const summary = await this.enhancedPropertyService.getAgentTransactionSummary(agentId);
      
      res.json({
        success: true,
        message: 'Transaction summary retrieved successfully',
        data: summary
      });
    } catch (error: any) {
      console.error('Error fetching transaction summary:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve transaction summary'
      });
    }
  };

  // === WITHDRAWAL REQUESTS ===
  getAgentWithdrawalRequests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const timeRange = req.query.timeRange as string || 'month';
      
      let startDate: Date;
      const now = new Date();
      
      switch (timeRange) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case 'year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      }

      const withdrawalRequests = await this.enhancedPropertyService.getAgentWithdrawalRequests(agentId, startDate);
      
      res.json({
        success: true,
        message: 'Withdrawal requests retrieved successfully',
        data: withdrawalRequests
      });
    } catch (error: any) {
      console.error('Error fetching withdrawal requests:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve withdrawal requests'
      });
    }
  };

  // === COMMISSION STATES ===
  getAgentCommissionStates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const paymentStates = await this.enhancedPropertyService.getPaymentCommissionStates(agentId);

      res.json({
        success: true,
        message: 'Commission states retrieved successfully',
        data: {
          payment: paymentStates,
          combined: {
            pending: paymentStates.pending,
            paid: paymentStates.completed,
            failed: paymentStates.failed,
            processing: paymentStates.processing
          }
        }
      });
    } catch (error: any) {
      console.error('Error fetching commission states:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve commission states'
      });
    }
  };

  // === BOOKING TRANSACTION DATA ===
  getBookingTransactionData = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const { bookingId } = req.params;
      
      if (!bookingId) {
        res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
        return;
      }

      const transactionData = await this.enhancedPropertyService.getBookingTransactionData(bookingId);
      
      res.json({
        success: true,
        message: 'Booking transaction data retrieved successfully',
        data: transactionData
      });
    } catch (error: any) {
      console.error('Error fetching booking transaction data:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve booking transaction data'
      });
    }
  };

  // === TRANSACTION ANALYTICS ===
  getTransactionAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const timeRange = req.query.timeRange as string || 'month';
      const type = req.query.type as string; // 'payment' | 'all'

      let startDate: Date;
      const now = new Date();

      switch (timeRange) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case 'year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      }

      const paymentBreakdown = await this.enhancedPropertyService.getAgentPaymentBreakdown(agentId, startDate);

      const analytics = {
        timeRange,
        payment: paymentBreakdown,
        combined: {
          totalTransactions: paymentBreakdown.total,
          totalAmount: paymentBreakdown.totalAmount,
          successfulTransactions: paymentBreakdown.completed,
          failedTransactions: paymentBreakdown.failed,
          pendingTransactions: paymentBreakdown.pending,
          successRate: (paymentBreakdown.completed / Math.max(paymentBreakdown.total, 1)) * 100
        }
      };

      res.json({
        success: true,
        message: 'Transaction analytics retrieved successfully',
        data: analytics
      });
    } catch (error: any) {
      console.error('Error fetching transaction analytics:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve transaction analytics'
      });
    }
  };

  // === REAL-TIME TRANSACTION STATUS ===
  getTransactionStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const { transactionId } = req.params;
      const { type } = req.query; // 'payment'

      if (!transactionId) {
        res.status(400).json({
          success: false,
          message: 'Transaction ID is required'
        });
        return;
      }

      let transaction = null;
      let transactionType = type;

      /*if (type === 'payment' || !type) {
        try {
          transaction = await this.enhancedPropertyService.getPaymentTransactionById(transactionId);
          if (transaction) transactionType = 'payment';
        } catch (error) {
          // Transaction not found
        }
      }*/

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
        return;
      }
      
      res.json({
        success: true,
        message: 'Transaction status retrieved successfully',
        data: {
          transaction,
          type: transactionType,
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error fetching transaction status:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve transaction status'
      });
    }
  };

  // === MONTHLY COMMISSION DATA WITH TRANSACTIONS ===
  getMonthlyCommissionsWithTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const monthlyData = await this.enhancedPropertyService.getAgentMonthlyCommissionsWithTransactions(agentId);
      
      res.json({
        success: true,
        message: 'Monthly commissions with transactions retrieved successfully',
        data: monthlyData
      });
    } catch (error: any) {
      console.error('Error fetching monthly commissions with transactions:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve monthly commission data'
      });
    }
  };

  // === TRANSACTION EXPORT ===
  exportTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const format = req.query.format as string || 'csv';
      const type = req.query.type as string || 'all'; // 'payment' | 'all'
      const timeRange = req.query.timeRange as string || 'month';

      // This would typically generate a file and return a download URL
      // For now, we'll return the transaction data in the requested format

      let startDate: Date;
      const now = new Date();

      switch (timeRange) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case 'year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      }

      const paymentTransactions = await this.enhancedPropertyService.getAgentPaymentTransactions(agentId);
      const filteredPayment = paymentTransactions.filter(t => new Date(t.createdAt) >= startDate);

      res.json({
        success: true,
        message: 'Transaction export data prepared successfully',
        data: {
          paymentTransactions: filteredPayment,
          format,
          type,
          timeRange,
          generatedAt: new Date().toISOString(),
          totalRecords: filteredPayment.length
        }
      });
    } catch (error: any) {
      console.error('Error exporting transactions:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to export transactions'
      });
    }
  };

  // === HELPER METHODS FOR TRANSACTION RETRIEVAL ===
  private async getPaymentTransactionById(transactionId: string) {
    // This would be implemented in the service layer
    // For now, returning null to indicate method exists
    return null;
  }
}