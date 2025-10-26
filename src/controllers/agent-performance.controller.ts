// Agent Performance Controller - Jambolush Dashboard
import { Request, Response } from 'express';
import { AgentPerformanceService } from '../services/agent-performance.service';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export class AgentPerformanceController {
  private performanceService: AgentPerformanceService;

  constructor() {
    this.performanceService = new AgentPerformanceService();
  }

  // ===== GET AGENT PERFORMANCE DASHBOARD =====
  getPerformanceDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const dashboard = await this.performanceService.getAgentPerformanceDashboard(agentId);

      res.json({
        success: true,
        message: 'Agent performance dashboard retrieved successfully',
        data: dashboard
      });
    } catch (error: any) {
      console.error('Error fetching agent performance dashboard:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve performance dashboard'
      });
    }
  };

  // ===== SAVE MONTHLY METRICS =====
  saveMonthlyMetrics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      await this.performanceService.saveMonthlyPerformanceMetrics(agentId);

      res.json({
        success: true,
        message: 'Monthly performance metrics saved successfully'
      });
    } catch (error: any) {
      console.error('Error saving monthly metrics:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to save monthly metrics'
      });
    }
  };
}
