import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate user type
      const validUserTypes = ['guest', 'host', 'tourguide', 'agent', 'admin'];
      if (req.body.userType && !validUserTypes.includes(req.body.userType)) {
        return res.status(400).json({ message: 'Invalid user type' });
      }

      // Validate required fields based on user type
      if (!req.body.userType || req.body.userType === 'guest') {
        // For regular signup (guests), all fields are required
        if (!req.body.firstName || !req.body.lastName || !req.body.email || !req.body.password) {
          return res.status(400).json({ 
            message: 'First name, last name, email, and password are required' 
          });
        }
      } else {
        // For service providers, email is always required
        if (!req.body.email) {
          return res.status(400).json({ 
            message: 'Email is required' 
          });
        }
        // Names or firstName/lastName required
        if (!req.body.names && (!req.body.firstName || !req.body.lastName)) {
          return res.status(400).json({ 
            message: 'Full name is required' 
          });
        }
      }

      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      if (error.message === 'User already exists') {
        res.status(409).json({ message: error.message });
      } else {
        res.status(400).json({ message: error.message });
      }
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.body.email || !req.body.password) {
        return res.status(400).json({ 
          message: 'Email and password are required' 
        });
      }

      const result = await authService.login(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  async googleAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ 
          message: 'Google token is required' 
        });
      }

      const result = await authService.googleAuth(token);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  async appleAuth(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.body.email || !req.body.providerId) {
        return res.status(400).json({ 
          message: 'Email and provider ID are required' 
        });
      }

      const result = await authService.appleAuth(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  // --- TOKEN MANAGEMENT ---
  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.body.refreshToken) {
        return res.status(400).json({ 
          message: 'Refresh token is required' 
        });
      }

      const result = await authService.refreshToken(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ 
          message: 'Refresh token is required' 
        });
      }

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
      if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required' });
      }

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

      const { currentPassword, newPassword, confirmPassword } = req.body;
      if (!newPassword || !confirmPassword) {
        return res.status(400).json({ 
          message: 'New password and confirm password are required' 
        });
      }

      await authService.changePassword(parseInt(req.user.userId), req.body);
      res.json({ message: 'Password changed successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  // --- SETUP PASSWORD (for service providers) ---
  async setupPassword(req: Request, res: Response) {
    try {
      const { email, token, newPassword } = req.body;
      
      if (!email || !token || !newPassword) {
        return res.status(400).json({ 
          message: 'Email, token, and new password are required' 
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ 
          message: 'Password must be at least 8 characters long' 
        });
      }

      await authService.setupPassword(email, token, newPassword);
      res.json({ message: 'Password set up successfully. You can now log in.' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  // --- FORGOT PASSWORD ---
  async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const result = await authService.forgotPassword(email);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async verifyOtp(req: Request, res: Response) {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        return res.status(400).json({ 
          message: 'Email and OTP are required' 
        });
      }

      const result = await authService.verifyOtp(email, otp);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async resetPassword(req: Request, res: Response) {
    try {
      const { email, otp, newPassword } = req.body;
      if (!email || !otp || !newPassword) {
        return res.status(400).json({ 
          message: 'Email, OTP, and new password are required' 
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ 
          message: 'Password must be at least 8 characters long' 
        });
      }

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
      // Check if user is admin
      if (!req.user?.userType || req.user.userType !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
      }

      const users = await authService.getAllUsers(req.query);
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getUserByEmail(req: Request, res: Response, next: NextFunction) {
    try {
      // Check if user is admin
      if (!req.user?.userType || req.user.userType !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
      }

      const { email } = req.params;
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

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
      // Check if user is admin or accessing their own data
      const { id } = req.params;
      const userId = parseInt(id);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const requestingUserId = parseInt(req.user?.userId || '0');
      const isAdmin = req.user?.userType === 'admin';
      
      if (!isAdmin && userId !== requestingUserId) {
        return res.status(403).json({ message: 'Access denied' });
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
      // Check if user is admin
      if (!req.user?.userType || req.user.userType !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
      }

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

  async getUsersByType(req: Request, res: Response, next: NextFunction) {
    try {
      // Check if user is admin
      if (!req.user?.userType || req.user.userType !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
      }

      const { userType } = req.params;
      const validUserTypes = ['guest', 'host', 'tourguide', 'agent', 'admin'];
      
      if (!validUserTypes.includes(userType)) {
        return res.status(400).json({ message: 'Invalid user type' });
      }
      
      const users = await authService.getAllUsers({ userType });
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}