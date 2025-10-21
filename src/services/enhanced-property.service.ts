// Enhanced Property Service with Transaction-Based Earnings Monitoring
import { PrismaClient } from '@prisma/client';
import { AgentDashboard, MonthlyCommissionData, EnhancedAgentEarnings, AgentBookingInfo } from '../types/enhanced-property.types';

const prisma = new PrismaClient();

export class EnhancedPropertyService {
  
  // === ENHANCED AGENT DASHBOARD WITH TRANSACTION MONITORING ===
  async getAgentDashboardWithTransactions(agentId: number): Promise<AgentDashboard | any> {
    const [
      totalClientsData,
      activeClientsData,
      transactionSummary,
      recentBookings,
      monthlyCommissions,
      escrowTransactions,
      paymentTransactions
    ] = await Promise.all([
      this.getAgentClients(agentId),
      this.getActiveAgentClients(agentId),
      this.getAgentTransactionSummary(agentId),
      this.getAgentRecentBookingsWithTransactions(agentId),
      this.getAgentMonthlyCommissionsWithTransactions(agentId),
      this.getAgentEscrowTransactions(agentId),
      this.getAgentPaymentTransactions(agentId)
    ]);

    return {
      totalClients: totalClientsData.length,
      activeClients: activeClientsData.length,
      totalCommissions: transactionSummary.totalCommissions,
      pendingCommissions: transactionSummary.pendingCommissions,
      failedCommissions: transactionSummary.failedCommissions,
      paidCommissions: transactionSummary.paidCommissions,
      escrowHeldAmount: transactionSummary.escrowHeldAmount,
      avgCommissionPerBooking: transactionSummary.avgCommissionPerBooking,
      recentBookings: recentBookings.map(this.transformToAgentBookingInfo),
      monthlyCommissions: monthlyCommissions,
      transactionBreakdown: {
        escrowTransactions: escrowTransactions.slice(0, 10),
        paymentTransactions: paymentTransactions.slice(0, 10),
        summary: transactionSummary
      }
    };
  }

  // === TRANSACTION SUMMARY CALCULATION ===
  async getAgentTransactionSummary(agentId: number) {
    const [escrowSummary, paymentSummary, agentBookings] = await Promise.all([
      // Transaction summary for agent (DEPOSIT/PAYOUT types)
      prisma.transaction.aggregate({
        where: {
          OR: [
            { userId: agentId },
            { recipientId: agentId }
          ],
          transactionType: { in: ['DEPOSIT', 'PAYOUT', 'COMMISSION'] }
        },
        _sum: { amount: true },
        _count: true
      }),
      
      // Payment transactions for agent
      prisma.paymentTransaction.aggregate({
        where: { userId: agentId },
        _sum: { amount: true },
        _count: true
      }),
      
      // Agent commission bookings
      prisma.agentBooking.findMany({
        where: { agentId },
        include: {
          client: { select: { firstName: true, lastName: true } }
        }
      })
    ]);

    // Calculate commission states from escrow and payment data
    const escrowStates = await this.getEscrowCommissionStates(agentId);
    const paymentStates = await this.getPaymentCommissionStates(agentId);
    
    const totalCommissions = agentBookings.reduce((sum, booking) => sum + booking.commission, 0);
    const avgCommissionPerBooking = agentBookings.length > 0 ? totalCommissions / agentBookings.length : 0;

    return {
      totalCommissions,
      pendingCommissions: escrowStates.pending + paymentStates.pending,
      failedCommissions: escrowStates.failed + paymentStates.failed,
      paidCommissions: escrowStates.paid + paymentStates.completed,
      escrowHeldAmount: escrowStates.held,
      avgCommissionPerBooking,
      escrowTransactionCount: escrowSummary._count,
      paymentTransactionCount: paymentSummary._count,
      totalTransactionAmount: (escrowSummary._sum.amount || 0) + (paymentSummary._sum.amount || 0)
    };
  }

  // === ESCROW COMMISSION STATES ===
  async getEscrowCommissionStates(agentId: number) {
    const escrowTransactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { userId: agentId },
          { recipientId: agentId }
        ],
        transactionType: { in: ['DEPOSIT', 'PAYOUT', 'COMMISSION'] }
      },
      select: {
        id: true,
        amount: true,
        status: true,
        transactionType: true,
        metadata: true
      }
    });

    const states = {
      pending: 0,
      held: 0,
      ready: 0,
      paid: 0,
      failed: 0,
      refunded: 0
    };

    escrowTransactions.forEach((transaction: any) => {
      const amount = transaction.amount;
      
      switch (transaction.status) {
        case 'PENDING':
          states.pending += amount;
          break;
        case 'HELD':
          states.held += amount;
          break;
        case 'READY':
          states.ready += amount;
          break;
        case 'RELEASED':
          states.paid += amount;
          break;
        case 'FAILED':
        case 'CANCELLED':
          states.failed += amount;
          break;
        case 'REFUNDED':
          states.refunded += amount;
          break;
        case 'COMPLETED':
          states.paid += amount;
          break;
      }
    });

    return states;
  }

  // === PAYMENT COMMISSION STATES ===
  async getPaymentCommissionStates(agentId: number) {
    const paymentTransactions = await prisma.paymentTransaction.findMany({
      where: { userId: agentId },
      select: {
        id: true,
        amount: true,
        status: true,
        type: true,
        metadata: true
      }
    });

    const states = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    paymentTransactions.forEach(transaction => {
      const amount = transaction.amount;
      
      switch (transaction.status) {
        case 'pending':
          states.pending += amount;
          break;
        case 'processing':
          states.processing += amount;
          break;
        case 'completed':
        case 'success':
          states.completed += amount;
          break;
        case 'failed':
        case 'cancelled':
          states.failed += amount;
          break;
      }
    });

    return states;
  }

  // === AGENT RECENT BOOKINGS WITH TRANSACTION DATA ===
  async getAgentRecentBookingsWithTransactions(agentId: number) {
    const recentBookings = await prisma.agentBooking.findMany({
      where: { agentId },
      include: {
        client: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Enrich with transaction data
    const enrichedBookings = await Promise.all(
      recentBookings.map(async (booking) => {
        const transactionData = await this.getBookingTransactionData(booking.id);
        return {
          ...booking,
          transactionData
        };
      })
    );

    return enrichedBookings;
  }

  // === GET BOOKING TRANSACTION DATA ===
  async getBookingTransactionData(agentBookingId: string) {
    const [escrowTransaction, paymentTransaction] = await Promise.all([
      prisma.transaction.findFirst({
        where: {
          transactionType: { in: ['DEPOSIT', 'PAYOUT', 'COMMISSION'] },
          metadata: {
            path: ['agentBookingId'],
            equals: agentBookingId
          }
        }
      }),
      prisma.paymentTransaction.findFirst({
        where: {
          metadata: {
            path: ['agentBookingId'],
            equals: agentBookingId
          }
        }
      })
    ]);

    return {
      escrowTransaction,
      paymentTransaction,
      hasActiveTransaction: !!(escrowTransaction || paymentTransaction),
      transactionStatus: escrowTransaction?.status || paymentTransaction?.status || 'none'
    };
  }

  // === MONTHLY COMMISSIONS WITH TRANSACTION TRACKING ===
  async getAgentMonthlyCommissionsWithTransactions(agentId: number): Promise<MonthlyCommissionData[] | any[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Get agent bookings with transaction data
    const agentBookings = await prisma.agentBooking.findMany({
      where: {
        agentId,
        createdAt: { gte: twelveMonthsAgo }
      },
      select: {
        id: true,
        commission: true,
        createdAt: true
      }
    });

    // Get related transactions (escrow-type)
    const escrowTransactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { userId: agentId },
          { recipientId: agentId }
        ],
        transactionType: { in: ['DEPOSIT', 'PAYOUT', 'COMMISSION'] },
        createdAt: { gte: twelveMonthsAgo }
      },
      select: {
        amount: true,
        status: true,
        createdAt: true,
        metadata: true
      }
    });

    // Get related payment transactions
    const paymentTransactions = await prisma.paymentTransaction.findMany({
      where: {
        userId: agentId,
        createdAt: { gte: twelveMonthsAgo }
      },
      select: {
        amount: true,
        status: true,
        createdAt: true,
        metadata: true
      }
    });

    const monthlyData: { [key: string]: MonthlyCommissionData } | any = {};

    // Process agent bookings
    agentBookings.forEach((booking: any) => {
      const month = booking.createdAt.toISOString().slice(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = {
          month,
          commission: 0,
          bookings: 0,
          escrowAmount: 0,
          paymentAmount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          failedAmount: 0
        };
      }
      monthlyData[month].commission += booking.commission;
      monthlyData[month].bookings += 1;
    });

    // Process escrow transactions
    escrowTransactions.forEach((transaction: any) => {
      const month = transaction.createdAt.toISOString().slice(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = {
          month,
          commission: 0,
          bookings: 0,
          escrowAmount: 0,
          paymentAmount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          failedAmount: 0
        };
      }
      
      monthlyData[month].escrowAmount += transaction.amount;
      
      if (['PENDING', 'HELD'].includes(transaction.status)) {
        monthlyData[month].pendingAmount += transaction.amount;
      } else if (transaction.status === 'RELEASED') {
        monthlyData[month].paidAmount += transaction.amount;
      } else if (['FAILED', 'CANCELLED'].includes(transaction.status)) {
        monthlyData[month].failedAmount += transaction.amount;
      }
    });

    // Process payment transactions
    paymentTransactions.forEach((transaction: any) => {
      const month = transaction.createdAt.toISOString().slice(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = {
          month,
          commission: 0,
          bookings: 0,
          escrowAmount: 0,
          paymentAmount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          failedAmount: 0
        };
      }
      
      monthlyData[month].paymentAmount += transaction.amount;
      
      if (['pending', 'processing'].includes(transaction.status)) {
        monthlyData[month].pendingAmount += transaction.amount;
      } else if (['completed', 'success'].includes(transaction.status)) {
        monthlyData[month].paidAmount += transaction.amount;
      } else if (['failed', 'cancelled'].includes(transaction.status)) {
        monthlyData[month].failedAmount += transaction.amount;
      }
    });

    return Object.values(monthlyData).sort((a: any, b: any) => a.month.localeCompare(b.month));
  }

  // === GET AGENT ESCROW TRANSACTIONS ===
  async getAgentEscrowTransactions(agentId: number) {
    return await prisma.transaction.findMany({
      where: {
        OR: [
          { userId: agentId },
          { recipientId: agentId }
        ],
        transactionType: { in: ['DEPOSIT', 'PAYOUT', 'COMMISSION'] }
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        recipient: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  // === GET AGENT PAYMENT TRANSACTIONS ===
  async getAgentPaymentTransactions(agentId: number) {
    return await prisma.paymentTransaction.findMany({
      where: { userId: agentId },
      include: {
        user: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  // === ENHANCED EARNINGS WITH TRANSACTION BREAKDOWN ===
  async getAgentEarningsWithTransactions(agentId: number, timeRange: 'week' | 'month' | 'quarter' | 'year'): Promise<EnhancedAgentEarnings | any> {
    const now = new Date();
    let startDate: Date;
    
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

    const [
      transactionSummary,
      escrowBreakdown,
      paymentBreakdown,
      withdrawalRequests
    ] = await Promise.all([
      this.getAgentTransactionSummary(agentId),
      this.getAgentEscrowBreakdown(agentId, startDate),
      this.getAgentPaymentBreakdown(agentId, startDate),
      this.getAgentWithdrawalRequests(agentId, startDate)
    ]);

    return {
      totalEarnings: transactionSummary.totalCommissions,
      totalBookings: await this.getAgentBookingCount(agentId),
      periodEarnings: await this.getPeriodEarnings(agentId, startDate),
      periodBookings: await this.getPeriodBookingCount(agentId, startDate),
      transactionBreakdown: {
        escrow: escrowBreakdown,
        payments: paymentBreakdown,
        withdrawals: withdrawalRequests
      },
      status: {
        pending: transactionSummary.pendingCommissions,
        held: transactionSummary.escrowHeldAmount,
        paid: transactionSummary.paidCommissions,
        failed: transactionSummary.failedCommissions
      },
      timeRange
    };
  }

  // === WITHDRAWAL REQUESTS ===
  async getAgentWithdrawalRequests(agentId: number, startDate: Date) {
    return await prisma.withdrawalRequest.findMany({
      where: {
        userId: agentId,
        createdAt: { gte: startDate }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  // === ESCROW BREAKDOWN ===
  async getAgentEscrowBreakdown(agentId: number, startDate: Date) {
    const escrowTransactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { userId: agentId },
          { recipientId: agentId }
        ],
        transactionType: { in: ['DEPOSIT', 'PAYOUT', 'COMMISSION'] },
        createdAt: { gte: startDate }
      },
      orderBy: { createdAt: 'desc' }
    });

    const breakdown = {
      total: escrowTransactions.length,
      pending: escrowTransactions.filter((t: any) => t.status === 'PENDING').length,
      held: escrowTransactions.filter((t: any) => t.status === 'HELD').length,
      released: escrowTransactions.filter((t: any) => t.status === 'RELEASED').length,
      failed: escrowTransactions.filter((t: any) => ['FAILED', 'CANCELLED'].includes(t.status)).length,
      totalAmount: escrowTransactions.reduce((sum: any, t: any) => sum + t.amount, 0),
      transactions: escrowTransactions
    };

    return breakdown;
  }

  // === PAYMENT BREAKDOWN ===
  async getAgentPaymentBreakdown(agentId: number, startDate: Date) {
    const paymentTransactions = await prisma.paymentTransaction.findMany({
      where: {
        userId: agentId,
        createdAt: { gte: startDate }
      },
      orderBy: { createdAt: 'desc' }
    });

    const breakdown = {
      total: paymentTransactions.length,
      pending: paymentTransactions.filter((t: any) => t.status === 'pending').length,
      processing: paymentTransactions.filter((t: any) => t.status === 'processing').length,
      completed: paymentTransactions.filter((t: any) => ['completed', 'success'].includes(t.status)).length,
      failed: paymentTransactions.filter((t: any) => ['failed', 'cancelled'].includes(t.status)).length,
      totalAmount: paymentTransactions.reduce((sum: any, t: any) => sum + t.amount, 0),
      transactions: paymentTransactions
    };

    return breakdown;
  }

  // === HELPER METHODS ===
  private async getAgentClients(agentId: number) {
    return await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: { agentId }
    });
  }

  private async getActiveAgentClients(agentId: number) {
    return await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: {
        agentId,
        status: 'active',
        createdAt: { gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) }
      }
    });
  }

  private async getAgentBookingCount(agentId: number) {
    return await prisma.agentBooking.count({
      where: { agentId }
    });
  }

  private async getPeriodEarnings(agentId: number, startDate: Date) {
    const result = await prisma.agentBooking.aggregate({
      where: {
        agentId,
        createdAt: { gte: startDate }
      },
      _sum: { commission: true }
    });
    return result._sum.commission || 0;
  }

  private async getPeriodBookingCount(agentId: number, startDate: Date) {
    return await prisma.agentBooking.count({
      where: {
        agentId,
        createdAt: { gte: startDate }
      }
    });
  }

  private transformToAgentBookingInfo(agentBooking: any): AgentBookingInfo {
    return {
      id: agentBooking.id,
      clientName: `${agentBooking.client.firstName} ${agentBooking.client.lastName}`,
      bookingType: agentBooking.bookingType,
      commission: agentBooking.commission,
      commissionStatus: agentBooking.status,
      bookingDate: agentBooking.createdAt.toISOString(),
      createdAt: agentBooking.createdAt.toISOString(),
      transactionData: agentBooking.transactionData || null
    };
  }

  // === TRANSACTION MONITORING DASHBOARD ===
  async getTransactionMonitoringDashboard(agentId: number) {
    const [
      escrowOverview,
      paymentOverview,
      recentTransactions,
      pendingWithdrawals,
      failedTransactions
    ] = await Promise.all([
      this.getEscrowOverview(agentId),
      this.getPaymentOverview(agentId),
      this.getRecentTransactionActivity(agentId),
      this.getPendingWithdrawals(agentId),
      this.getFailedTransactions(agentId)
    ]);

    return {
      overview: {
        escrow: escrowOverview,
        payments: paymentOverview
      },
      recentActivity: recentTransactions,
      pendingActions: {
        withdrawals: pendingWithdrawals,
        failedTransactions: failedTransactions
      },
      alerts: this.generateTransactionAlerts(escrowOverview, paymentOverview, failedTransactions)
    };
  }

  private async getEscrowOverview(agentId: number) {
    const summary = await prisma.transaction.groupBy({
      by: ['status'],
      where: {
        OR: [
          { userId: agentId },
          { recipientId: agentId }
        ],
        transactionType: { in: ['DEPOSIT', 'PAYOUT', 'COMMISSION'] }
      },
      _sum: { amount: true },
      _count: true
    });

    return summary.reduce((acc: any, item: any) => {
      acc[item.status.toLowerCase()] = {
        count: item._count,
        amount: item._sum.amount || 0
      };
      return acc;
    }, {} as any);
  }

  private async getPaymentOverview(agentId: number) {
    const summary = await prisma.paymentTransaction.groupBy({
      by: ['status'],
      where: { userId: agentId },
      _sum: { amount: true },
      _count: true
    });

    return summary.reduce((acc, item) => {
      acc[item.status.toLowerCase()] = {
        count: item._count,
        amount: item._sum.amount || 0
      };
      return acc;
    }, {} as any);
  }

  private async getRecentTransactionActivity(agentId: number) {
    const [escrowTransactions, paymentTransactions] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          OR: [
            { userId: agentId },
            { recipientId: agentId }
          ],
          transactionType: { in: ['DEPOSIT', 'PAYOUT', 'COMMISSION'] }
        },
        include: {
          user: { select: { firstName: true, lastName: true } },
          recipient: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.paymentTransaction.findMany({
        where: { userId: agentId },
        include: {
          user: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    // Combine and sort by date
    const allTransactions = [
      ...escrowTransactions.map((t: any) => ({ ...t, source: 'escrow' })),
      ...paymentTransactions.map((t: any) => ({ ...t, source: 'payment' }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return allTransactions.slice(0, 15);
  }

  private async getPendingWithdrawals(agentId: number) {
    return await prisma.withdrawalRequest.findMany({
      where: {
        userId: agentId,
        status: 'PENDING'
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  private async getFailedTransactions(agentId: number) {
    const [failedEscrow, failedPayments] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          OR: [
            { userId: agentId },
            { recipientId: agentId }
          ],
          transactionType: { in: ['DEPOSIT', 'PAYOUT', 'COMMISSION'] },
          status: { in: ['FAILED', 'CANCELLED'] }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.paymentTransaction.findMany({
        where: {
          userId: agentId,
          status: { in: ['failed', 'cancelled'] }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    return [...failedEscrow, ...failedPayments];
  }

  private generateTransactionAlerts(escrowOverview: any, paymentOverview: any, failedTransactions: any[]) {
    const alerts = [];

    // Check for high failure rates
    const totalEscrow = Object.values(escrowOverview).reduce((sum: number, item: any) => sum + item.count, 0);
    const failedEscrow = (escrowOverview.failed?.count || 0) + (escrowOverview.cancelled?.count || 0);
    
    if (totalEscrow > 0 && (failedEscrow / totalEscrow) > 0.1) {
      alerts.push({
        type: 'warning',
        title: 'High Escrow Failure Rate',
        message: `${Math.round((failedEscrow / totalEscrow) * 100)}% of your escrow transactions have failed recently`,
        action: 'Review failed transactions'
      });
    }

    // Check for pending withdrawals
    if (escrowOverview.pending?.count > 0) {
      alerts.push({
        type: 'info',
        title: 'Pending Escrow Transactions',
        message: `You have ${escrowOverview.pending.count} pending escrow transactions`,
        action: 'Check transaction status'
      });
    }

    return alerts;
  }
}