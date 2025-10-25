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
      managedProperties,
      recentEarnings,
      walletData,
      recentActivity,
      monthlyCommissions,
      escrowTransactions,
      paymentTransactions
    ] = await Promise.all([
      this.getAgentClients(agentId),
      this.getActiveAgentClients(agentId),
      this.getAgentTransactionSummary(agentId),
      this.getAgentRecentBookingsWithTransactions(agentId, 5), // Get at least 5 recent bookings
      this.getAgentManagedProperties(agentId), // Get managed properties
      this.getAgentRecentEarnings(agentId), // Get recent earnings
      this.getAgentWalletOverview(agentId), // Get wallet overview
      this.getAgentRecentActivity(agentId), // Get recent activity
      this.getAgentMonthlyCommissionsWithTransactions(agentId),
      this.getAgentEscrowTransactions(agentId),
      this.getAgentPaymentTransactions(agentId)
    ]);

    // Calculate total bookings count for agent's properties only
    const agentProperties = await prisma.property.findMany({
      where: { agentId },
      select: { id: true }
    });
    const agentPropertyIds = agentProperties.map(p => p.id);

    const totalBookingsCount = await prisma.booking.count({
      where: { propertyId: { in: agentPropertyIds } }
    });

    return {
      // Summary Stats
      summaryStats: {
        totalBookings: totalBookingsCount,
        totalEarnings: transactionSummary.totalCommissions,
        totalManagedProperties: managedProperties.length,
        totalEarningsOverall: transactionSummary.paidCommissions,
        totalClients: totalClientsData.length,
        activeClients: activeClientsData.length
      },

      // Recent Data
      recentBookings: recentBookings.map(this.transformToAgentBookingInfo),
      recentManagedProperties: managedProperties,
      recentEarnings: recentEarnings,
      recentActivity: recentActivity,

      // Wallet Overview
      walletOverview: walletData,

      // Commission Breakdown
      commissions: {
        total: transactionSummary.totalCommissions,
        pending: transactionSummary.pendingCommissions,
        paid: transactionSummary.paidCommissions,
        failed: transactionSummary.failedCommissions,
        escrowHeld: transactionSummary.escrowHeldAmount,
        avgPerBooking: transactionSummary.avgCommissionPerBooking
      },

      // Monthly Data
      monthlyCommissions: monthlyCommissions,

      // Transaction Details
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
  async getAgentRecentBookingsWithTransactions(agentId: number, limit: number = 10) {
    // Get properties uploaded by this agent
    const agentProperties = await prisma.property.findMany({
      where: { agentId },
      select: { id: true }
    });

    const agentPropertyIds = agentProperties.map(p => p.id);

    // Get recent bookings for agent's properties only
    const recentBookings = await prisma.booking.findMany({
      where: {
        propertyId: { in: agentPropertyIds }
      },
      include: {
        property: { select: { name: true, location: true, images: true, hostId: true } },
        guest: { select: { firstName: true, lastName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    // Enrich with transaction data and agent commission info
    const enrichedBookings = await Promise.all(
      recentBookings.map(async (booking) => {
        const agentBookingData = await prisma.agentBooking.findFirst({
          where: {
            bookingId: booking.id,
            agentId
          },
          include: {
            client: { select: { firstName: true, lastName: true, email: true } }
          }
        });

        // Get transaction data only if agentBooking exists
        const transactionData = agentBookingData
          ? await this.getBookingTransactionData(agentBookingData.id)
          : null;

        return {
          id: agentBookingData?.id || booking.id,
          bookingId: booking.id,
          agentId,
          clientId: booking.property.hostId,
          commission: agentBookingData?.commission || 0,
          status: agentBookingData?.status || 'pending',
          createdAt: booking.createdAt,
          client: agentBookingData?.client || { firstName: 'N/A', lastName: '', email: '' },
          property: booking.property,
          transactionData
        };
      })
    );

    return enrichedBookings;
  }

  // === GET PROPERTY DATA FOR AGENT BOOKING ===
  private async getPropertyDataForAgentBooking(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        property: {
          select: {
            id: true,
            name: true,
            location: true,
            images: true
          }
        }
      }
    });

    return booking?.property || null;
  }

  // === GET AGENT MANAGED PROPERTIES ===
  async getAgentManagedProperties(agentId: number) {
    const properties = await prisma.property.findMany({
      where: { agentId },
      select: {
        id: true,
        name: true,
        location: true,
        type: true,
        category: true,
        pricePerNight: true,
        status: true,
        images: true,
        averageRating: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });

    // Get booking and review counts separately
    const propertiesWithCounts = await Promise.all(
      properties.map(async (property) => {
        const [bookingCount, reviewCount] = await Promise.all([
          prisma.booking.count({ where: { propertyId: property.id } }),
          prisma.review.count({ where: { propertyId: property.id } })
        ]);

        return {
          ...property,
          rating: property.averageRating || 0,
          totalBookings: bookingCount,
          totalReviews: reviewCount
        };
      })
    );

    return propertiesWithCounts;
  }

  // === GET AGENT RECENT EARNINGS ===
  async getAgentRecentEarnings(agentId: number) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get properties uploaded by this agent
    const agentProperties = await prisma.property.findMany({
      where: { agentId },
      select: { id: true }
    });
    const agentPropertyIds = agentProperties.map(p => p.id);

    // Get recent bookings for agent's properties
    const recentBookings = await prisma.booking.findMany({
      where: {
        propertyId: { in: agentPropertyIds },
        createdAt: { gte: thirtyDaysAgo }
      },
      include: {
        property: { select: { name: true, hostId: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Enrich with agent commission data
    const enrichedEarnings = await Promise.all(
      recentBookings.map(async (booking) => {
        const agentBookingData = await prisma.agentBooking.findFirst({
          where: {
            bookingId: booking.id,
            agentId
          },
          include: {
            client: { select: { firstName: true, lastName: true } }
          }
        });

        return {
          id: agentBookingData?.id || booking.id,
          amount: agentBookingData?.commission || 0,
          date: booking.createdAt,
          source: `Booking #${booking.id}`,
          clientName: agentBookingData ? `${agentBookingData.client.firstName} ${agentBookingData.client.lastName}` : 'N/A',
          propertyName: booking.property?.name || 'N/A',
          status: agentBookingData?.status || 'pending'
        };
      })
    );

    // Filter out bookings with no commission
    return enrichedEarnings.filter(e => e.amount > 0);
  }

  // === GET AGENT WALLET OVERVIEW ===
  async getAgentWalletOverview(agentId: number) {
    const [walletData, escrowStates, paymentStates, withdrawalRequests] = await Promise.all([
      prisma.wallet.findUnique({
        where: { userId: agentId }
      }),
      this.getEscrowCommissionStates(agentId),
      this.getPaymentCommissionStates(agentId),
      prisma.withdrawalRequest.findMany({
        where: {
          userId: agentId,
          status: { in: ['pending', 'processing'] }
        }
      })
    ]);

    const availableBalance = walletData?.balance || 0;
    const pendingWithdrawals = withdrawalRequests.reduce((sum, req) => sum + req.amount, 0);

    return {
      availableBalance,
      pendingBalance: escrowStates.pending + paymentStates.pending,
      heldBalance: escrowStates.held,
      totalEarned: escrowStates.paid + paymentStates.completed,
      pendingWithdrawals,
      currency: walletData?.currency || 'KES',
      lastUpdated: walletData?.updatedAt || new Date()
    };
  }

  // === GET AGENT RECENT ACTIVITY ===
  async getAgentRecentActivity(agentId: number) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get properties uploaded by this agent
    const agentProperties = await prisma.property.findMany({
      where: { agentId },
      select: { id: true }
    });
    const agentPropertyIds = agentProperties.map(p => p.id);

    const [recentBookings, recentTransactions, recentWithdrawals, recentProperties] = await Promise.all([
      // Recent bookings for agent's properties
      prisma.booking.findMany({
        where: {
          propertyId: { in: agentPropertyIds },
          createdAt: { gte: sevenDaysAgo }
        },
        include: {
          property: { select: { name: true, hostId: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),

      // Recent transactions
      prisma.transaction.findMany({
        where: {
          OR: [
            { userId: agentId },
            { recipientId: agentId }
          ],
          createdAt: { gte: sevenDaysAgo }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),

      // Recent withdrawal requests
      prisma.withdrawalRequest.findMany({
        where: {
          userId: agentId,
          createdAt: { gte: sevenDaysAgo }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),

      // Recent property updates
      prisma.property.findMany({
        where: {
          agentId,
          updatedAt: { gte: sevenDaysAgo }
        },
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: 5
      })
    ]);

    // Combine and sort all activities
    const activities: any[] = [];

    // Process bookings with async to get commission data
    for (const booking of recentBookings) {
      const agentBookingData = await prisma.agentBooking.findFirst({
        where: {
          bookingId: booking.id,
          agentId
        },
        include: {
          client: { select: { firstName: true, lastName: true } }
        }
      });

      activities.push({
        type: 'booking',
        action: 'New booking created',
        description: agentBookingData
          ? `Booking by ${agentBookingData.client.firstName} ${agentBookingData.client.lastName}`
          : `Booking for ${booking.property.name}`,
        timestamp: booking.createdAt,
        metadata: {
          bookingId: booking.id,
          commission: agentBookingData?.commission || 0,
          propertyName: booking.property.name
        }
      });
    }

    recentTransactions.forEach(transaction => {
      activities.push({
        type: 'transaction',
        action: `${transaction.transactionType} transaction`,
        description: `Amount: ${transaction.amount} ${transaction.currency}`,
        timestamp: transaction.createdAt,
        metadata: {
          transactionId: transaction.id,
          status: transaction.status
        }
      });
    });

    recentWithdrawals.forEach(withdrawal => {
      activities.push({
        type: 'withdrawal',
        action: 'Withdrawal request',
        description: `Amount: ${withdrawal.amount} - Status: ${withdrawal.status}`,
        timestamp: withdrawal.createdAt,
        metadata: {
          withdrawalId: withdrawal.id,
          status: withdrawal.status
        }
      });
    });

    recentProperties.forEach(property => {
      activities.push({
        type: 'property',
        action: 'Property updated',
        description: `${property.name} - Status: ${property.status}`,
        timestamp: property.updatedAt,
        metadata: {
          propertyId: property.id,
          status: property.status
        }
      });
    });

    // Sort by timestamp descending and return top 10
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
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