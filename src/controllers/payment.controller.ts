import { Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';
import {
  DepositDto,
  WithdrawalDto,
  TransferDto,
  BalanceInquiryDto,
  PaymentFilters,
  JengaCallbackData,
  PaymentResponse,
  PaymentSuccessResponse,
  PaymentErrorResponse
} from '../types/payment.types';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

export class PaymentController {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  // --- DEPOSIT OPERATIONS ---
  deposit = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const depositData: DepositDto = req.body;

      const transaction = await this.paymentService.deposit(userId, depositData);

      const response: PaymentSuccessResponse = {
        success: true,
        data: transaction,
        message: 'Deposit initiated successfully'
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('Deposit controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'DEPOSIT_FAILED',
          message: error.message || 'Failed to process deposit',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  // --- WITHDRAWAL OPERATIONS ---
  withdraw = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const withdrawalData: WithdrawalDto = req.body;

      const transaction = await this.paymentService.withdraw(userId, withdrawalData);

      const response: PaymentSuccessResponse = {
        success: true,
        data: transaction,
        message: 'Withdrawal initiated successfully'
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('Withdrawal controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'WITHDRAWAL_FAILED',
          message: error.message || 'Failed to process withdrawal',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  // --- TRANSFER OPERATIONS ---
  transfer = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const transferData: TransferDto = req.body;

      const transaction = await this.paymentService.transfer(userId, transferData);

      const response: PaymentSuccessResponse = {
        success: true,
        data: transaction,
        message: 'Transfer initiated successfully'
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('Transfer controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'TRANSFER_FAILED',
          message: error.message || 'Failed to process transfer',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  // --- BALANCE OPERATIONS ---
  getBalance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const balanceInquiry: BalanceInquiryDto = req.body;

      const balance = await this.paymentService.getBalance(userId, balanceInquiry);

      const response: PaymentSuccessResponse = {
        success: true,
        data: balance,
        message: 'Balance retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Balance inquiry controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'BALANCE_INQUIRY_FAILED',
          message: error.message || 'Failed to retrieve balance',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  getUserWallet = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);

      const wallet = await this.paymentService.getUserWallet(userId);

      const response: PaymentSuccessResponse = {
        success: true,
        data: wallet,
        message: 'Wallet retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get wallet controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'WALLET_RETRIEVAL_FAILED',
          message: error.message || 'Failed to retrieve wallet',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  // --- TRANSACTION MANAGEMENT ---
  getTransactionHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      // Parse filters from query parameters
      const filters: PaymentFilters = {
        userId,
        type: req.query.type ? (req.query.type as string).split(',') as any[] : undefined,
        method: req.query.method ? (req.query.method as string).split(',') as any[] : undefined,
        status: req.query.status ? (req.query.status as string).split(',') as any[] : undefined,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
        reference: req.query.reference as string,
        phoneNumber: req.query.phoneNumber as string,
        accountNumber: req.query.accountNumber as string
      };

      const history = await this.paymentService.getTransactionHistory(userId, filters, page, limit);

      const response: PaymentSuccessResponse = {
        success: true,
        data: history,
        message: 'Transaction history retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get transaction history controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'TRANSACTION_HISTORY_FAILED',
          message: error.message || 'Failed to retrieve transaction history',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  getTransactionById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const transactionId = req.params.id;

      if (!transactionId) {
        const errorResponse: PaymentErrorResponse = {
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_ID',
            message: 'Transaction ID is required',
            timestamp: new Date().toISOString()
          }
        };
        res.status(400).json(errorResponse);
        return;
      }

      const transaction = await this.paymentService.getTransactionById(transactionId, userId);

      if (!transaction) {
        const errorResponse: PaymentErrorResponse = {
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
            timestamp: new Date().toISOString()
          }
        };
        res.status(404).json(errorResponse);
        return;
      }

      const response: PaymentSuccessResponse = {
        success: true,
        data: transaction,
        message: 'Transaction retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get transaction by ID controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'TRANSACTION_RETRIEVAL_FAILED',
          message: error.message || 'Failed to retrieve transaction',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  // --- RETRY AND CANCEL OPERATIONS ---
  retryTransaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const transactionId = req.params.id;

      if (!transactionId) {
        const errorResponse: PaymentErrorResponse = {
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_ID',
            message: 'Transaction ID is required',
            timestamp: new Date().toISOString()
          }
        };
        res.status(400).json(errorResponse);
        return;
      }

      const transaction = await this.paymentService.retryFailedTransaction(transactionId, userId);

      const response: PaymentSuccessResponse = {
        success: true,
        data: transaction,
        message: 'Transaction retry initiated successfully'
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('Retry transaction controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'TRANSACTION_RETRY_FAILED',
          message: error.message || 'Failed to retry transaction',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  cancelTransaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const transactionId = req.params.id;

      if (!transactionId) {
        const errorResponse: PaymentErrorResponse = {
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_ID',
            message: 'Transaction ID is required',
            timestamp: new Date().toISOString()
          }
        };
        res.status(400).json(errorResponse);
        return;
      }

      await this.paymentService.cancelPendingTransaction(transactionId, userId);

      const response: PaymentSuccessResponse = {
        success: true,
        data: { transactionId, status: 'cancelled' },
        message: 'Transaction cancelled successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Cancel transaction controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'TRANSACTION_CANCEL_FAILED',
          message: error.message || 'Failed to cancel transaction',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  // --- USER SETTINGS & LIMITS ---
  getPaymentLimits = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);

      // This method would need to be implemented in PaymentService
      const limits = await (this.paymentService as any).getUserPaymentLimits(userId);

      const response: PaymentSuccessResponse = {
        success: true,
        data: limits,
        message: 'Payment limits retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get payment limits controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'LIMITS_RETRIEVAL_FAILED',
          message: error.message || 'Failed to retrieve payment limits',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  getPaymentSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);

      const settings = await this.paymentService.getPaymentSettings(userId);

      const response: PaymentSuccessResponse = {
        success: true,
        data: settings,
        message: 'Payment settings retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get payment settings controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'SETTINGS_RETRIEVAL_FAILED',
          message: error.message || 'Failed to retrieve payment settings',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  updatePaymentSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const updates = req.body;

      const settings = await this.paymentService.updatePaymentSettings(userId, updates);

      const response: PaymentSuccessResponse = {
        success: true,
        data: settings,
        message: 'Payment settings updated successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Update payment settings controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'SETTINGS_UPDATE_FAILED',
          message: error.message || 'Failed to update payment settings',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  // --- BANK ACCOUNT MANAGEMENT ---
  addBankAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const accountData = req.body;

      const bankAccount = await this.paymentService.addBankAccount(userId, accountData);

      const response: PaymentSuccessResponse = {
        success: true,
        data: bankAccount,
        message: 'Bank account added successfully'
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('Add bank account controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'BANK_ACCOUNT_ADD_FAILED',
          message: error.message || 'Failed to add bank account',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  getUserBankAccounts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);

      const bankAccounts = await this.paymentService.getUserBankAccounts(userId);

      const response: PaymentSuccessResponse = {
        success: true,
        data: bankAccounts,
        message: 'Bank accounts retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get user bank accounts controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'BANK_ACCOUNTS_RETRIEVAL_FAILED',
          message: error.message || 'Failed to retrieve bank accounts',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  removeBankAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const accountId = req.params.id;

      await this.paymentService.removeBankAccount(userId, accountId);

      const response: PaymentSuccessResponse = {
        success: true,
        data: { accountId },
        message: 'Bank account removed successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Remove bank account controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'BANK_ACCOUNT_REMOVE_FAILED',
          message: error.message || 'Failed to remove bank account',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  // --- MOBILE MONEY ACCOUNT MANAGEMENT ---
  addMobileMoneyAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);
      const accountData = req.body;

      const mobileAccount = await this.paymentService.addMobileMoneyAccount(userId, accountData);

      const response: PaymentSuccessResponse = {
        success: true,
        data: mobileAccount,
        message: 'Mobile money account added successfully'
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('Add mobile money account controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'MOBILE_ACCOUNT_ADD_FAILED',
          message: error.message || 'Failed to add mobile money account',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  getUserMobileMoneyAccounts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.user!.userId);

      const mobileAccounts = await this.paymentService.getUserMobileMoneyAccounts(userId);

      const response: PaymentSuccessResponse = {
        success: true,
        data: mobileAccounts,
        message: 'Mobile money accounts retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get user mobile money accounts controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'MOBILE_ACCOUNTS_RETRIEVAL_FAILED',
          message: error.message || 'Failed to retrieve mobile money accounts',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  // --- ADMIN OPERATIONS ---
  getAllTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Note: This would require admin role verification middleware
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      // Parse filters from query parameters
      const filters: PaymentFilters = {
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        type: req.query.type ? (req.query.type as string).split(',') as any[] : undefined,
        status: req.query.status ? (req.query.status as string).split(',') as any[] : undefined,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined
      };

      const result = await this.paymentService.getAllTransactions(filters, page, limit);

      const response: PaymentSuccessResponse = {
        success: true,
        data: result,
        message: 'All transactions retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get all transactions controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'ALL_TRANSACTIONS_RETRIEVAL_FAILED',
          message: error.message || 'Failed to retrieve all transactions',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  // --- WEBHOOK HANDLING ---
  handleJengaWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const callbackData: JengaCallbackData = req.body;

      console.log('Received Jenga webhook:', JSON.stringify(callbackData, null, 2));

      await this.paymentService.handleJengaCallback(callbackData);

      // Respond to Jenga that we received the webhook
      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } catch (error: any) {
      console.error('Jenga webhook controller error:', error);
      
      // Still respond with 200 to prevent Jenga from retrying
      res.status(200).json({
        success: false,
        error: 'Webhook processing failed'
      });
    }
  };

  // --- UTILITY ENDPOINTS ---
  getBanks = async (req: Request, res: Response): Promise<void> => {
    try {
      // This would typically fetch from a database or external service
      const banks = [
        { code: '01', name: 'Kenya Commercial Bank', shortName: 'KCB' },
        { code: '02', name: 'Standard Chartered Bank', shortName: 'SCB' },
        { code: '03', name: 'Barclays Bank of Kenya', shortName: 'Barclays' },
        { code: '04', name: 'Citibank N.A', shortName: 'Citibank' },
        { code: '05', name: 'Bank of Baroda', shortName: 'BOB' },
        { code: '06', name: 'Commercial Bank of Africa', shortName: 'CBA' },
        { code: '07', name: 'Co-operative Bank of Kenya', shortName: 'Co-op Bank' },
        { code: '08', name: 'National Bank of Kenya', shortName: 'NBK' },
        { code: '09', name: 'Prime Bank', shortName: 'Prime Bank' },
        { code: '10', name: 'Imperial Bank', shortName: 'Imperial' },
        { code: '11', name: 'Equity Bank', shortName: 'Equity' },
        { code: '12', name: 'Diamond Trust Bank', shortName: 'DTB' },
        { code: '13', name: 'Housing Finance Company of Kenya', shortName: 'HFC' },
        { code: '14', name: 'NIC Bank', shortName: 'NIC' },
        { code: '15', name: 'Bank of Africa', shortName: 'BOA' },
        { code: '16', name: 'Family Bank', shortName: 'Family Bank' },
        { code: '17', name: 'African Banking Corporation', shortName: 'ABC Bank' },
        { code: '18', name: 'Consolidated Bank of Kenya', shortName: 'Consolidated' },
        { code: '19', name: 'Credit Bank', shortName: 'Credit Bank' },
        { code: '20', name: 'Stanbic Bank Kenya', shortName: 'Stanbic' }
      ];

      const response: PaymentSuccessResponse = {
        success: true,
        data: banks,
        message: 'Banks retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get banks controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'BANKS_RETRIEVAL_FAILED',
          message: error.message || 'Failed to retrieve banks',
          timestamp: new Date().toISOString()
        }
      };

      res.status(500).json(errorResponse);
    }
  };

  validateBankAccount = async (req: Request, res: Response): Promise<void> => {
    try {
      const { accountNumber, bankCode } = req.body;

      if (!accountNumber || !bankCode) {
        const errorResponse: PaymentErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Account number and bank code are required',
            timestamp: new Date().toISOString()
          }
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Use private method from PaymentService (would need to make it public or create a separate validation service)
      const validation = await (this.paymentService as any).validateBankAccount(accountNumber, bankCode);

      const response: PaymentSuccessResponse = {
        success: true,
        data: validation,
        message: 'Bank account validation completed'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Validate bank account controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: error.message || 'Failed to validate bank account',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };

  validatePhoneNumber = async (req: Request, res: Response): Promise<void> => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        const errorResponse: PaymentErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Phone number is required',
            timestamp: new Date().toISOString()
          }
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Use private method from PaymentService (would need to make it public or create a separate validation service)
      const validation = await (this.paymentService as any).validatePhoneNumber(phoneNumber);

      const response: PaymentSuccessResponse = {
        success: true,
        data: validation,
        message: 'Phone number validation completed'
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Validate phone number controller error:', error);
      
      const errorResponse: PaymentErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: error.message || 'Failed to validate phone number',
          timestamp: new Date().toISOString()
        }
      };

      res.status(400).json(errorResponse);
    }
  };
}