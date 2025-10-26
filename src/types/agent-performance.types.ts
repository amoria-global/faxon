// Agent Performance Dashboard Types

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
