"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedPropertyController = void 0;
const enhanced_property_service_1 = require("../services/enhanced-property.service");
class EnhancedPropertyController {
    constructor() {
        // === ENHANCED AGENT DASHBOARD WITH TRANSACTIONS ===
        this.getAgentDashboard = async (req, res) => {
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
            }
            catch (error) {
                console.error('Error fetching enhanced agent dashboard:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve enhanced dashboard'
                });
            }
        };
        // === AGENT EARNINGS WITH TRANSACTION BREAKDOWN ===
        this.getAgentEarningsWithTransactions = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const agentId = parseInt(req.user.userId);
                const timeRange = req.query.timeRange || 'month';
                const earnings = await this.enhancedPropertyService.getAgentEarningsWithTransactions(agentId, timeRange);
                res.json({
                    success: true,
                    message: 'Agent earnings with transactions retrieved successfully',
                    data: earnings
                });
            }
            catch (error) {
                console.error('Error fetching agent earnings with transactions:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve earnings'
                });
            }
        };
        // === TRANSACTION MONITORING DASHBOARD ===
        this.getTransactionMonitoringDashboard = async (req, res) => {
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
            }
            catch (error) {
                console.error('Error fetching transaction monitoring dashboard:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve monitoring data'
                });
            }
        };
        // === ESCROW TRANSACTIONS ===
        this.getAgentEscrowTransactions = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const agentId = parseInt(req.user.userId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const status = req.query.status;
                const escrowTransactions = await this.enhancedPropertyService.getAgentEscrowTransactions(agentId);
                // Apply filters if provided
                let filteredTransactions = escrowTransactions;
                if (status) {
                    filteredTransactions = escrowTransactions.filter(t => t.status === status);
                }
                // Apply pagination
                const startIndex = (page - 1) * limit;
                const endIndex = startIndex + limit;
                const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);
                res.json({
                    success: true,
                    message: 'Escrow transactions retrieved successfully',
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
            }
            catch (error) {
                console.error('Error fetching escrow transactions:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve escrow transactions'
                });
            }
        };
        // === PAYMENT TRANSACTIONS ===
        this.getAgentPaymentTransactions = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const agentId = parseInt(req.user.userId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const status = req.query.status;
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
            }
            catch (error) {
                console.error('Error fetching payment transactions:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve payment transactions'
                });
            }
        };
        // === TRANSACTION SUMMARY ===
        this.getAgentTransactionSummary = async (req, res) => {
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
            }
            catch (error) {
                console.error('Error fetching transaction summary:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve transaction summary'
                });
            }
        };
        // === WITHDRAWAL REQUESTS ===
        this.getAgentWithdrawalRequests = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const agentId = parseInt(req.user.userId);
                const timeRange = req.query.timeRange || 'month';
                let startDate;
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
            }
            catch (error) {
                console.error('Error fetching withdrawal requests:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve withdrawal requests'
                });
            }
        };
        // === COMMISSION STATES ===
        this.getAgentCommissionStates = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const agentId = parseInt(req.user.userId);
                const [escrowStates, paymentStates] = await Promise.all([
                    this.enhancedPropertyService.getEscrowCommissionStates(agentId),
                    this.enhancedPropertyService.getPaymentCommissionStates(agentId)
                ]);
                res.json({
                    success: true,
                    message: 'Commission states retrieved successfully',
                    data: {
                        escrow: escrowStates,
                        payment: paymentStates,
                        combined: {
                            pending: escrowStates.pending + paymentStates.pending,
                            held: escrowStates.held,
                            ready: escrowStates.ready,
                            paid: escrowStates.paid + paymentStates.completed,
                            failed: escrowStates.failed + paymentStates.failed,
                            processing: paymentStates.processing
                        }
                    }
                });
            }
            catch (error) {
                console.error('Error fetching commission states:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve commission states'
                });
            }
        };
        // === BOOKING TRANSACTION DATA ===
        this.getBookingTransactionData = async (req, res) => {
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
            }
            catch (error) {
                console.error('Error fetching booking transaction data:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve booking transaction data'
                });
            }
        };
        // === TRANSACTION ANALYTICS ===
        this.getTransactionAnalytics = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const agentId = parseInt(req.user.userId);
                const timeRange = req.query.timeRange || 'month';
                const type = req.query.type; // 'escrow' | 'payment' | 'all'
                let startDate;
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
                const [escrowBreakdown, paymentBreakdown] = await Promise.all([
                    this.enhancedPropertyService.getAgentEscrowBreakdown(agentId, startDate),
                    this.enhancedPropertyService.getAgentPaymentBreakdown(agentId, startDate)
                ]);
                const analytics = {
                    timeRange,
                    escrow: escrowBreakdown,
                    payment: paymentBreakdown,
                    combined: {
                        totalTransactions: escrowBreakdown.total + paymentBreakdown.total,
                        totalAmount: escrowBreakdown.totalAmount + paymentBreakdown.totalAmount,
                        successfulTransactions: escrowBreakdown.released + paymentBreakdown.completed,
                        failedTransactions: escrowBreakdown.failed + paymentBreakdown.failed,
                        pendingTransactions: escrowBreakdown.pending + paymentBreakdown.pending,
                        successRate: ((escrowBreakdown.released + paymentBreakdown.completed) /
                            Math.max(escrowBreakdown.total + paymentBreakdown.total, 1)) * 100
                    }
                };
                res.json({
                    success: true,
                    message: 'Transaction analytics retrieved successfully',
                    data: analytics
                });
            }
            catch (error) {
                console.error('Error fetching transaction analytics:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve transaction analytics'
                });
            }
        };
        // === REAL-TIME TRANSACTION STATUS ===
        this.getTransactionStatus = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const { transactionId } = req.params;
                const { type } = req.query; // 'escrow' | 'payment'
                if (!transactionId) {
                    res.status(400).json({
                        success: false,
                        message: 'Transaction ID is required'
                    });
                    return;
                }
                let transaction = null;
                let transactionType = type;
                /*if (type === 'escrow' || !type) {
                  try {
                    transaction = await this.enhancedPropertyService.getEscrowTransactionById(transactionId);
                    if (transaction) transactionType = 'escrow';
                  } catch (error) {
                    // Continue to check payment transactions
                  }
                }
          
                if (!transaction && (type === 'payment' || !type)) {
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
            }
            catch (error) {
                console.error('Error fetching transaction status:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve transaction status'
                });
            }
        };
        // === MONTHLY COMMISSION DATA WITH TRANSACTIONS ===
        this.getMonthlyCommissionsWithTransactions = async (req, res) => {
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
            }
            catch (error) {
                console.error('Error fetching monthly commissions with transactions:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to retrieve monthly commission data'
                });
            }
        };
        // === TRANSACTION EXPORT ===
        this.exportTransactions = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const agentId = parseInt(req.user.userId);
                const format = req.query.format || 'csv';
                const type = req.query.type || 'all'; // 'escrow' | 'payment' | 'all'
                const timeRange = req.query.timeRange || 'month';
                // This would typically generate a file and return a download URL
                // For now, we'll return the transaction data in the requested format
                let startDate;
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
                const [escrowTransactions, paymentTransactions] = await Promise.all([
                    type === 'payment' ? [] : this.enhancedPropertyService.getAgentEscrowTransactions(agentId),
                    type === 'escrow' ? [] : this.enhancedPropertyService.getAgentPaymentTransactions(agentId)
                ]);
                const filteredEscrow = escrowTransactions.filter(t => new Date(t.createdAt) >= startDate);
                const filteredPayment = paymentTransactions.filter(t => new Date(t.createdAt) >= startDate);
                res.json({
                    success: true,
                    message: 'Transaction export data prepared successfully',
                    data: {
                        escrowTransactions: filteredEscrow,
                        paymentTransactions: filteredPayment,
                        format,
                        type,
                        timeRange,
                        generatedAt: new Date().toISOString(),
                        totalRecords: filteredEscrow.length + filteredPayment.length
                    }
                });
            }
            catch (error) {
                console.error('Error exporting transactions:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to export transactions'
                });
            }
        };
        this.enhancedPropertyService = new enhanced_property_service_1.EnhancedPropertyService();
    }
    // === HELPER METHODS FOR TRANSACTION RETRIEVAL ===
    async getEscrowTransactionById(transactionId) {
        // This would be implemented in the service layer
        // For now, returning null to indicate method exists
        return null;
    }
    async getPaymentTransactionById(transactionId) {
        // This would be implemented in the service layer
        // For now, returning null to indicate method exists
        return null;
    }
}
exports.EnhancedPropertyController = EnhancedPropertyController;
