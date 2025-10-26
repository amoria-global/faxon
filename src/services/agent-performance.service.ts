// Agent Performance Service - Matches Jambolush Dashboard Design
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AgentPerformanceDashboard {
  // Agent Profile
  profile: {
    id: number;
    name: string;
    location: string;
    tier: string;
    status: string;
    avatar?: string;
  };

  // Key Metrics (Top Row)
  engagementRate: {
    value: number;
    change: number; // percentage change from last period
  };

  ownerRating: {
    value: number;
    change: number;
  };

  monthlyIncome: {
    value: number;
    change: number; // percentage change
  };

  dropRate: {
    value: number;
    change: number;
  };

  // Stats
  statsThisMonth: {
    leadsGenerated: number;
    listingsLive: number;
  };

  // Final Score (0-100)
  finalScore: {
    current: number;
    change: number; // vs last month
  };

  // Category Breakdown (Normalized 0-100 scores)
  categoryBreakdown: {
    quality: number;           // 30% weight
    productivity: number;      // 25% weight
    reliability: number;       // 20% weight
    financialImpact: number;   // 15% weight
    compliance: number;        // 10% weight
  };

  // Goal Tracking
  goalTracking: {
    engagementRateGoal: { target: number; current: number };
    listingSuccessGoal: { target: number; current: number };
    monthlyIncomeGoal: { target: number; current: number };
    dropRateGoal: { target: number; current: number };
  };

  // Top Agents Ranking
  topAgents: Array<{
    name: string;
    finalScore: number;
    tier: string;
    income: number;
  }>;

  // Current Agent Rank
  agentRank: {
    position: number;
    totalAgents: number;
  };
}

export class AgentPerformanceService {

  // ===== MAIN DASHBOARD METHOD =====
  async getAgentPerformanceDashboard(agentId: number): Promise<AgentPerformanceDashboard> {
    const [
      profile,
      engagementRate,
      ownerRating,
      monthlyIncome,
      dropRate,
      stats,
      categoryScores,
      goals,
      topAgents,
      agentRank
    ] = await Promise.all([
      this.getAgentProfile(agentId),
      this.calculateEngagementRate(agentId),
      this.calculateOwnerRating(agentId),
      this.calculateMonthlyIncome(agentId),
      this.calculateDropRate(agentId),
      this.getMonthlyStats(agentId),
      this.calculateCategoryBreakdown(agentId),
      this.getAgentGoals(agentId),
      this.getTopAgents(),
      this.getAgentRanking(agentId)
    ]);

    // Calculate Final Score (weighted average)
    const finalScore = this.calculateFinalScore(categoryScores);
    const lastMonthScore = await this.getLastMonthFinalScore(agentId);

    return {
      profile,
      engagementRate,
      ownerRating,
      monthlyIncome,
      dropRate,
      statsThisMonth: stats,
      finalScore: {
        current: finalScore,
        change: finalScore - lastMonthScore
      },
      categoryBreakdown: categoryScores,
      goalTracking: goals,
      topAgents,
      agentRank
    };
  }

  // ===== AGENT PROFILE =====
  private async getAgentProfile(agentId: number) {
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        city: true,
        country: true,
        profileImage: true,
        status: true
      }
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    // Determine tier based on performance
    const tier = await this.determineAgentTier(agentId);

    return {
      id: agent.id,
      name: `${agent.firstName} ${agent.lastName}`,
      location: `${agent.city || 'Unknown'} • ${agent.country || 'Unknown'}`,
      tier,
      status: agent.status || 'Active',
      avatar: agent.profileImage || undefined
    };
  }

  // ===== ENGAGEMENT RATE (Lead Conversion) =====
  private async calculateEngagementRate(agentId: number) {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [currentLeads, currentConversions, lastMonthLeads, lastMonthConversions] = await Promise.all([
      // Current month leads
      prisma.lead.count({
        where: { agentId, createdAt: { gte: currentMonth } }
      }),
      // Current month conversions
      prisma.lead.count({
        where: { agentId, createdAt: { gte: currentMonth }, status: 'converted', convertedAt: { not: null } }
      }),
      // Last month leads
      prisma.lead.count({
        where: { agentId, createdAt: { gte: lastMonth, lt: currentMonth } }
      }),
      // Last month conversions
      prisma.lead.count({
        where: { agentId, createdAt: { gte: lastMonth, lt: currentMonth }, status: 'converted', convertedAt: { not: null } }
      })
    ]);

    const currentRate = currentLeads > 0 ? (currentConversions / currentLeads) * 100 : 0;
    const lastMonthRate = lastMonthLeads > 0 ? (lastMonthConversions / lastMonthLeads) * 100 : 0;
    const change = lastMonthRate > 0 ? ((currentRate - lastMonthRate) / lastMonthRate) * 100 : 0;

    return {
      value: Math.round(currentRate * 10) / 10, // Round to 1 decimal
      change: Math.round(change * 10) / 10
    };
  }

  // ===== OWNER/CLIENT RATING =====
  private async calculateOwnerRating(agentId: number) {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [currentRating, lastMonthRating] = await Promise.all([
      // Current month average rating
      prisma.agentReview.aggregate({
        where: { agentId, createdAt: { gte: currentMonth } },
        _avg: { rating: true },
        _count: true
      }),
      // Last month average rating
      prisma.agentReview.aggregate({
        where: { agentId, createdAt: { gte: lastMonth, lt: currentMonth } },
        _avg: { rating: true }
      })
    ]);

    const currentValue = currentRating._avg.rating || 0;
    const lastMonthValue = lastMonthRating._avg.rating || 0;
    const change = currentValue - lastMonthValue;

    return {
      value: Math.round(currentValue * 10) / 10,
      change: Math.round(change * 10) / 10
    };
  }

  // ===== MONTHLY INCOME =====
  private async calculateMonthlyIncome(agentId: number) {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [currentIncome, lastMonthIncome] = await Promise.all([
      // Current month commissions
      prisma.agentCommission.aggregate({
        where: {
          agentId,
          createdAt: { gte: currentMonth },
          status: { in: ['earned', 'paid'] }
        },
        _sum: { amount: true }
      }),
      // Last month commissions
      prisma.agentCommission.aggregate({
        where: {
          agentId,
          createdAt: { gte: lastMonth, lt: currentMonth },
          status: { in: ['earned', 'paid'] }
        },
        _sum: { amount: true }
      })
    ]);

    const currentValue = currentIncome._sum.amount || 0;
    const lastMonthValue = lastMonthIncome._sum.amount || 0;
    const change = lastMonthValue > 0 ? ((currentValue - lastMonthValue) / lastMonthValue) * 100 : 0;

    return {
      value: Math.round(currentValue),
      change: Math.round(change)
    };
  }

  // ===== DROP RATE (Cancelled/Failed Bookings) =====
  private async calculateDropRate(agentId: number) {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Get agent's properties
    const agentProperties = await prisma.property.findMany({
      where: { agentId },
      select: { id: true }
    });
    const propertyIds = agentProperties.map(p => p.id);

    const [currentTotal, currentDropped, lastMonthTotal, lastMonthDropped] = await Promise.all([
      // Current month total bookings
      prisma.booking.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: currentMonth } }
      }),
      // Current month dropped bookings
      prisma.booking.count({
        where: {
          propertyId: { in: propertyIds },
          createdAt: { gte: currentMonth },
          status: { in: ['cancelled', 'rejected', 'failed'] }
        }
      }),
      // Last month total
      prisma.booking.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: lastMonth, lt: currentMonth } }
      }),
      // Last month dropped
      prisma.booking.count({
        where: {
          propertyId: { in: propertyIds },
          createdAt: { gte: lastMonth, lt: currentMonth },
          status: { in: ['cancelled', 'rejected', 'failed'] }
        }
      })
    ]);

    const currentRate = currentTotal > 0 ? (currentDropped / currentTotal) * 100 : 0;
    const lastMonthRate = lastMonthTotal > 0 ? (lastMonthDropped / lastMonthTotal) * 100 : 0;
    const change = currentRate - lastMonthRate;

    return {
      value: Math.round(currentRate * 10) / 10,
      change: Math.round(change * 10) / 10
    };
  }

  // ===== MONTHLY STATS =====
  private async getMonthlyStats(agentId: number) {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [leadsGenerated, listingsLive] = await Promise.all([
      prisma.lead.count({
        where: { agentId, createdAt: { gte: currentMonth } }
      }),
      prisma.property.count({
        where: { agentId, status: 'active' }
      })
    ]);

    return {
      leadsGenerated,
      listingsLive
    };
  }

  // ===== CATEGORY BREAKDOWN (0-100 Normalized Scores) =====
  private async calculateCategoryBreakdown(agentId: number) {
    const [quality, productivity, reliability, financialImpact, compliance] = await Promise.all([
      this.calculateQualityScore(agentId),
      this.calculateProductivityScore(agentId),
      this.calculateReliabilityScore(agentId),
      this.calculateFinancialImpactScore(agentId),
      this.calculateComplianceScore(agentId)
    ]);

    return {
      quality,
      productivity,
      reliability,
      financialImpact,
      compliance
    };
  }

  // ===== QUALITY SCORE (30% weight) - Based on client satisfaction =====
  private async calculateQualityScore(agentId: number): Promise<number> {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const ratings = await prisma.agentReview.aggregate({
      where: { agentId, createdAt: { gte: sixMonthsAgo } },
      _avg: {
        rating: true,
        communicationRating: true,
        professionalismRating: true,
        knowledgeRating: true,
        responsivenessRating: true
      },
      _count: true
    });

    if (ratings._count === 0) return 0;

    // Average all rating dimensions (1-5 scale)
    const avgRating = [
      ratings._avg.rating || 0,
      ratings._avg.communicationRating || 0,
      ratings._avg.professionalismRating || 0,
      ratings._avg.knowledgeRating || 0,
      ratings._avg.responsivenessRating || 0
    ].filter(r => r > 0).reduce((sum, r) => sum + r, 0);

    const count = [
      ratings._avg.rating,
      ratings._avg.communicationRating,
      ratings._avg.professionalismRating,
      ratings._avg.knowledgeRating,
      ratings._avg.responsivenessRating
    ].filter(r => r !== null).length;

    const averageScore = count > 0 ? avgRating / count : 0;

    // Convert from 1-5 scale to 0-100 scale
    return Math.round((averageScore / 5) * 100);
  }

  // ===== PRODUCTIVITY SCORE (25% weight) - Booking success rate =====
  private async calculateProductivityScore(agentId: number): Promise<number> {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const agentProperties = await prisma.property.findMany({
      where: { agentId },
      select: { id: true }
    });
    const propertyIds = agentProperties.map(p => p.id);

    const [totalBookings, successfulBookings] = await Promise.all([
      prisma.booking.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: threeMonthsAgo } }
      }),
      prisma.booking.count({
        where: {
          propertyId: { in: propertyIds },
          createdAt: { gte: threeMonthsAgo },
          status: { in: ['confirmed', 'completed'] }
        }
      })
    ]);

    if (totalBookings === 0) return 0;

    const successRate = (successfulBookings / totalBookings) * 100;
    return Math.round(successRate);
  }

  // ===== RELIABILITY SCORE (20% weight) - Customer retention =====
  private async calculateReliabilityScore(agentId: number): Promise<number> {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    // Get all unique clients in the period
    const allClients = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: { agentId, createdAt: { gte: sixMonthsAgo } }
    });

    if (allClients.length === 0) return 0;

    // Find repeat clients (more than 1 booking)
    const repeatClients = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: { agentId, createdAt: { gte: sixMonthsAgo } },
      _count: { clientId: true },
      having: { clientId: { _count: { gt: 1 } } }
    });

    const retentionRate = (repeatClients.length / allClients.length) * 100;

    // Normalize: 50% retention = 100 score, scale accordingly
    return Math.min(Math.round((retentionRate / 50) * 100), 100);
  }

  // ===== FINANCIAL IMPACT SCORE (15% weight) - Commission growth =====
  private async calculateFinancialImpactScore(agentId: number): Promise<number> {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const [currentCommissions, lastMonthCommissions] = await Promise.all([
      prisma.agentCommission.aggregate({
        where: {
          agentId,
          createdAt: { gte: lastMonth, lt: currentMonth },
          status: { in: ['earned', 'paid'] }
        },
        _sum: { amount: true }
      }),
      prisma.agentCommission.aggregate({
        where: {
          agentId,
          createdAt: { gte: twoMonthsAgo, lt: lastMonth },
          status: { in: ['earned', 'paid'] }
        },
        _sum: { amount: true }
      })
    ]);

    const current = currentCommissions._sum.amount || 0;
    const previous = lastMonthCommissions._sum.amount || 0;

    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }

    const growthRate = ((current - previous) / previous) * 100;

    // Normalize: 20% growth = 100 score
    // Negative growth = lower score
    if (growthRate >= 20) return 100;
    if (growthRate <= -20) return 0;

    return Math.round(((growthRate + 20) / 40) * 100);
  }

  // ===== COMPLIANCE SCORE (10% weight) - Response time & professionalism =====
  private async calculateComplianceScore(agentId: number): Promise<number> {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const inquiries = await prisma.inquiry.findMany({
      where: {
        agentId,
        createdAt: { gte: threeMonthsAgo },
        isResponded: true,
        responseTime: { not: null }
      },
      select: { responseTime: true }
    });

    if (inquiries.length === 0) return 100; // No data = full score

    // Calculate average response time in hours
    const avgResponseTime = inquiries.reduce((sum, inq) => sum + (inq.responseTime || 0), 0) / inquiries.length;

    // Normalize: < 2 hours = 100, > 24 hours = 0
    if (avgResponseTime <= 2) return 100;
    if (avgResponseTime >= 24) return 0;

    return Math.round(((24 - avgResponseTime) / 22) * 100);
  }

  // ===== FINAL SCORE (Weighted Average) =====
  private calculateFinalScore(categories: {
    quality: number;
    productivity: number;
    reliability: number;
    financialImpact: number;
    compliance: number;
  }): number {
    const weightedScore =
      (categories.quality * 0.30) +
      (categories.productivity * 0.25) +
      (categories.reliability * 0.20) +
      (categories.financialImpact * 0.15) +
      (categories.compliance * 0.10);

    return Math.round(weightedScore * 10) / 10; // Round to 1 decimal
  }

  // ===== LAST MONTH FINAL SCORE =====
  private async getLastMonthFinalScore(agentId: number): Promise<number> {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const metric = await prisma.agentPerformanceMetric.findFirst({
      where: {
        agentId,
        metricType: 'final_score',
        periodStart: lastMonth
      },
      select: { value: true }
    });

    return metric?.value || 0;
  }

  // ===== AGENT TIER DETERMINATION =====
  private async determineAgentTier(agentId: number): Promise<string> {
    const categories = await this.calculateCategoryBreakdown(agentId);
    const finalScore = this.calculateFinalScore(categories);

    if (finalScore >= 90) return 'Platinum';
    if (finalScore >= 80) return 'Gold';
    if (finalScore >= 70) return 'Silver';
    if (finalScore >= 60) return 'Bronze';
    return 'Standard';
  }

  // ===== AGENT GOALS =====
  private async getAgentGoals(agentId: number) {
    // Default goals - could be customized per agent
    const engagementRate = await this.calculateEngagementRate(agentId);

    const agentProperties = await prisma.property.findMany({
      where: { agentId, status: 'active' },
      select: { id: true }
    });
    const propertyIds = agentProperties.map(p => p.id);

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalBookings, successfulBookings] = await Promise.all([
      prisma.booking.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: currentMonth } }
      }),
      prisma.booking.count({
        where: {
          propertyId: { in: propertyIds },
          createdAt: { gte: currentMonth },
          status: { in: ['confirmed', 'completed'] }
        }
      })
    ]);

    const listingSuccess = totalBookings > 0 ? (successfulBookings / totalBookings) * 100 : 0;
    const monthlyIncome = await this.calculateMonthlyIncome(agentId);
    const dropRate = await this.calculateDropRate(agentId);

    return {
      engagementRateGoal: { target: 75, current: engagementRate.value },
      listingSuccessGoal: { target: 88, current: Math.round(listingSuccess) },
      monthlyIncomeGoal: { target: 2750, current: monthlyIncome.value },
      dropRateGoal: { target: 3, current: dropRate.value }
    };
  }

  // ===== TOP AGENTS RANKING =====
  private async getTopAgents(): Promise<Array<{
    name: string;
    finalScore: number;
    tier: string;
    income: number;
  }>> {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all agents with properties
    const agents = await prisma.user.findMany({
      where: {
        userType: 'agent',
        agentManagedProperties: { some: {} }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true
      },
      take: 100 // Limit to top 100 agents for performance
    });

    // Calculate scores for each agent
    const agentScores = await Promise.all(
      agents.map(async (agent) => {
        const categories = await this.calculateCategoryBreakdown(agent.id);
        const finalScore = this.calculateFinalScore(categories);
        const tier = await this.determineAgentTier(agent.id);

        const income = await prisma.agentCommission.aggregate({
          where: {
            agentId: agent.id,
            createdAt: { gte: currentMonth },
            status: { in: ['earned', 'paid'] }
          },
          _sum: { amount: true }
        });

        return {
          name: `${agent.firstName} ${agent.lastName}`,
          finalScore,
          tier,
          income: Math.round(income._sum.amount || 0)
        };
      })
    );

    // Sort by final score and return top 5
    return agentScores
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 5);
  }

  // ===== AGENT RANKING =====
  private async getAgentRanking(agentId: number): Promise<{ position: number; totalAgents: number }> {
    const categories = await this.calculateCategoryBreakdown(agentId);
    const agentScore = this.calculateFinalScore(categories);

    // Get all agents
    const allAgents = await prisma.user.findMany({
      where: {
        userType: 'agent',
        agentManagedProperties: { some: {} }
      },
      select: { id: true }
    });

    // Calculate scores for all agents
    const scores = await Promise.all(
      allAgents.map(async (agent) => {
        const cats = await this.calculateCategoryBreakdown(agent.id);
        return {
          agentId: agent.id,
          score: this.calculateFinalScore(cats)
        };
      })
    );

    // Sort and find position
    scores.sort((a, b) => b.score - a.score);
    const position = scores.findIndex(s => s.agentId === agentId) + 1;

    return {
      position,
      totalAgents: scores.length
    };
  }

  // ===== SAVE PERFORMANCE METRICS (for historical tracking) =====
  async saveMonthlyPerformanceMetrics(agentId: number): Promise<void> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const categories = await this.calculateCategoryBreakdown(agentId);
    const finalScore = this.calculateFinalScore(categories);
    const engagementRate = await this.calculateEngagementRate(agentId);
    const ownerRating = await this.calculateOwnerRating(agentId);
    const monthlyIncome = await this.calculateMonthlyIncome(agentId);
    const dropRate = await this.calculateDropRate(agentId);

    const metrics = [
      { type: 'final_score', value: finalScore },
      { type: 'quality_score', value: categories.quality },
      { type: 'productivity_score', value: categories.productivity },
      { type: 'reliability_score', value: categories.reliability },
      { type: 'financial_impact_score', value: categories.financialImpact },
      { type: 'compliance_score', value: categories.compliance },
      { type: 'engagement_rate', value: engagementRate.value },
      { type: 'owner_rating', value: ownerRating.value },
      { type: 'monthly_income', value: monthlyIncome.value },
      { type: 'drop_rate', value: dropRate.value }
    ];

    for (const metric of metrics) {
      await prisma.agentPerformanceMetric.upsert({
        where: {
          agentId_metricType_period_periodStart: {
            agentId,
            metricType: metric.type,
            period: 'monthly',
            periodStart
          }
        },
        update: {
          value: metric.value,
          periodEnd,
          updatedAt: new Date()
        },
        create: {
          agentId,
          metricType: metric.type,
          value: metric.value,
          period: 'monthly',
          periodStart,
          periodEnd
        }
      });
    }
  }
}
