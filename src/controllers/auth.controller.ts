import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  async googleAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.body;
      const result = await authService.googleAuth(token);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  async appleAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.appleAuth(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  // --- TOKEN MANAGEMENT ---
  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.refreshToken(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      await authService.logout(refreshToken);
      res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async logoutAllDevices(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }
      await authService.logoutAllDevices(parseInt(req.user.userId));
      res.json({ message: 'Logged out from all devices successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  // --- USER PROFILE MANAGEMENT ---
  async getCurrentUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }
      const user = await authService.getUserProfile(parseInt(req.user.userId));
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }
      const user = await authService.updateUserProfile(parseInt(req.user.userId), req.body);
      res.json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async updateProfileImage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }
      const { imageUrl } = req.body;
      const user = await authService.updateProfileImage(parseInt(req.user.userId), imageUrl);
      res.json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }
      await authService.changePassword(parseInt(req.user.userId), req.body);
      res.json({ message: 'Password changed successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }


  // --- FORGOT PASSWORD ---
  async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword(email);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async verifyOtp(req: Request, res: Response) {
    try {
      const { email, otp } = req.body;
      const result = await authService.verifyOtp(email, otp);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async resetPassword(req: Request, res: Response) {
    try {
      const { email, otp, newPassword } = req.body;
      await authService.resetPassword(email, otp, newPassword);
      res.status(200).json({ message: 'Password has been reset successfully.' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }


  // --- SESSION MANAGEMENT ---
  async getUserSessions(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }
      const sessions = await authService.getUserSessions(parseInt(req.user.userId));
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  // --- USER QUERIES (Admin/Protected) ---
  async getAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await authService.getAllUsers(req.query);
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getUserByEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.params;
      const user = await authService.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = parseInt(id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }
      
      const user = await authService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getUsersByProvider(req: Request, res: Response, next: NextFunction) {
    try {
      const { provider } = req.params;
      if (!['manual', 'google', 'apple'].includes(provider)) {
        return res.status(400).json({ message: 'Invalid provider' });
      }
      
      const users = await authService.getUsersByProvider(provider as 'manual' | 'google' | 'apple');
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}