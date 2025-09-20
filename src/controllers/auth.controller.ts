// src/controllers/auth.controller.ts
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
        if (!req.body.firstName || !req.body.lastName || !req.body.email || !req.body.password) {
          return res.status(400).json({ 
            message: 'First name, last name, email, and password are required' 
          });
        }
      } else {
        if (!req.body.email) {
          return res.status(400).json({ 
            message: 'Email is required' 
          });
        }
        if (!req.body.names && (!req.body.firstName || !req.body.lastName)) {
          return res.status(400).json({ 
            message: 'Full name is required' 
          });
        }
      }

      // Tour guide specific validation
      if (req.body.userType === 'tourguide') {
        if (!req.body.tourGuideType || !['freelancer', 'employed'].includes(req.body.tourGuideType)) {
          return res.status(400).json({ 
            message: 'Valid tour guide type (freelancer or employed) is required' 
          });
        }

        if (req.body.tourGuideType === 'freelancer' && !req.body.nationalId) {
          return res.status(400).json({ 
            message: 'National ID is required for freelance tour guides' 
          });
        }

        if (req.body.tourGuideType === 'employed') {
          if (!req.body.companyTIN || !req.body.companyName) {
            return res.status(400).json({ 
              message: 'Company TIN and company name are required for employed tour guides' 
            });
          }
        }
      }

      const result = await authService.register(req.body, req);
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

      const result = await authService.login(req.body, req);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

 async updateDocumentUrl(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const { documentType, documentUrl } = req.body;
      
      if (!documentType || !['verification', 'employment'].includes(documentType)) {
        return res.status(400).json({ 
          message: 'Invalid document type. Must be "verification" or "employment"' 
        });
      }

      if (!documentUrl || typeof documentUrl !== 'string') {
        return res.status(400).json({ 
          message: 'Document URL is required and must be a valid string' 
        });
      }

      // Basic URL validation
      try {
        new URL(documentUrl);
      } catch {
        return res.status(400).json({ 
          message: 'Invalid document URL format' 
        });
      }

      const user = await authService.updateDocumentUrl(
        parseInt(req.user.userId),
        documentType,
        documentUrl
      );

      res.json({
        success: true,
        data: { user },
        message: 'Document URL updated successfully'
      });
    } catch (error: any) {
      res.status(400).json({ 
        success: false,
        message: error.message 
      });
    }
  }

  async getUserDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const documents = await authService.getUserDocuments(parseInt(req.user.userId));
      
      res.json({
        success: true,
        data: documents
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        message: error.message 
      });
    }
  }

  async removeDocumentUrl(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const { documentType } = req.params;
      
      if (!documentType || !['verification', 'employment'].includes(documentType)) {
        return res.status(400).json({ 
          message: 'Invalid document type' 
        });
      }

      // Set document URL to null
      const user = await authService.updateDocumentUrl(
        parseInt(req.user.userId),
        documentType as 'verification' | 'employment',
        '' // Empty string or null to remove
      );

      res.json({
        success: true,
        data: { user },
        message: 'Document URL removed successfully'
      });
    } catch (error: any) {
      res.status(400).json({ 
        success: false,
        message: error.message 
      });
    }
  }

  async updateTourGuideType(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const { tourGuideType } = req.body;
      
      if (!tourGuideType || !['freelancer', 'employed'].includes(tourGuideType)) {
        return res.status(400).json({ 
          message: 'Invalid tour guide type. Must be "freelancer" or "employed"' 
        });
      }

      const user = await authService.updateUserProfile(
        parseInt(req.user.userId), 
        { tourGuideType },
        req
      );

      res.json({
        success: true,
        data: { user },
        message: 'Tour guide type updated successfully'
      });
    } catch (error: any) {
      res.status(400).json({ 
        success: false, 
        message: error.message 
      });
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

      const result = await authService.googleAuth(token, req);
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

      const result = await authService.appleAuth(req.body, req);
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
      const user = await authService.updateUserProfile(parseInt(req.user.userId), req.body, req);
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

      // Optional: Validate that it's a proper Supabase URL for security
      if (!imageUrl.startsWith('https://') || !imageUrl.includes('supabase.co')) {
        return res.status(400).json({ message: 'Invalid image URL format' });
      }

      const user = await authService.updateProfileImage(parseInt(req.user.userId), imageUrl);
      
      res.json({ 
        success: true,
        data: {
          profile: imageUrl, 
          user
        },
        message: 'Profile image updated successfully'
      });
      
    } catch (error: any) {
      console.error('Backend error:', error);
      res.status(400).json({ 
        success: false,
        message: error.message 
      });
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

      await authService.changePassword(parseInt(req.user.userId), req.body, req);
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

      await authService.setupPassword(email, token, newPassword, req);
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

      const result = await authService.forgotPassword(email, req);
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

      await authService.resetPassword(email, otp, newPassword, req);
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
      if (!req.user?.userType || req.user.userType === 'guest') {
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

  // --- ADMIN CRUD OPERATIONS ---

  async adminCreateUser(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate required fields
      if (!req.body.email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      // Validate user type if provided
      const validUserTypes = ['guest', 'host', 'tourguide', 'agent', 'admin'];
      if (req.body.userType && !validUserTypes.includes(req.body.userType)) {
        return res.status(400).json({ message: 'Invalid user type' });
      }

      // Validate status if provided
      const validStatuses = ['active', 'inactive', 'pending', 'suspended', 'unverified'];
      if (req.body.status && !validStatuses.includes(req.body.status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const user = await authService.adminCreateUser(req.body, req);
      res.status(201).json({
        message: 'User created successfully',
        user
      });
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        res.status(409).json({ message: error.message });
      } else {
        res.status(400).json({ message: error.message });
      }
    }
  }

  async adminUpdateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      // Validate user type if provided
      if (req.body.userType) {
        const validUserTypes = ['guest', 'host', 'tourguide', 'agent', 'admin'];
        if (!validUserTypes.includes(req.body.userType)) {
          return res.status(400).json({ message: 'Invalid user type' });
        }
      }

      // Validate status if provided
      if (req.body.status) {
        const validStatuses = ['active', 'inactive', 'pending', 'suspended', 'unverified'];
        if (!validStatuses.includes(req.body.status)) {
          return res.status(400).json({ message: 'Invalid status' });
        }
      }

      const user = await authService.adminUpdateUser(userId, req.body);
      res.json({
        message: 'User updated successfully',
        user
      });
    } catch (error: any) {
      if (error.message === 'User not found') {
        res.status(404).json({ message: error.message });
      } else {
        res.status(400).json({ message: error.message });
      }
    }
  }

  async adminDeleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      // Prevent self-deletion
      const requestingUserId = parseInt(req.user?.userId || '0');
      if (userId === requestingUserId) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      const result = await authService.adminDeleteUser(userId);
      res.json(result);
    } catch (error: any) {
      if (error.message === 'User not found') {
        res.status(404).json({ message: error.message });
      } else {
        res.status(400).json({ message: error.message });
      }
    }
  }

  async adminSuspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      // Prevent self-suspension
      const requestingUserId = parseInt(req.user?.userId || '0');
      if (userId === requestingUserId) {
        return res.status(400).json({ message: 'Cannot suspend your own account' });
      }

      const { reason } = req.body;
      const user = await authService.adminSuspendUser(userId, reason, req);
      res.json({
        message: 'User suspended successfully',
        user
      });
    } catch (error: any) {
      if (error.message === 'User not found') {
        res.status(404).json({ message: error.message });
      } else {
        res.status(400).json({ message: error.message });
      }
    }
  }

  async adminActivateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const user = await authService.adminActivateUser(userId, req);
      res.json({
        message: 'User activated successfully',
        user
      });
    } catch (error: any) {
      if (error.message === 'User not found') {
        res.status(404).json({ message: error.message });
      } else {
        res.status(400).json({ message: error.message });
      }
    }
  }

  async adminResetUserPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const result = await authService.adminResetUserPassword(userId, req);
      res.json({
        message: 'Password reset successfully',
        temporaryPassword: result.temporaryPassword,
        note: 'Please share this temporary password securely with the user'
      });
    } catch (error: any) {
      if (error.message === 'User not found') {
        res.status(404).json({ message: error.message });
      } else {
        res.status(400).json({ message: error.message });
      }
    }
  }

// --- KYC METHODS ---
async submitKYC(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { personalDetails, addressDocumentUrl } = req.body;
    
    if (!personalDetails) {
      return res.status(400).json({ 
        message: 'Personal details are required' 
      });
    }

    // Validate required fields
    const { fullName, dateOfBirth, nationality, address, phoneNumber, email } = personalDetails;
    if (!fullName || !dateOfBirth || !nationality || !address || !phoneNumber || !email) {
      return res.status(400).json({ 
        message: 'All personal details fields are required' 
      });
    }

    const result = await authService.submitKYC(
      parseInt(req.user.userId),
      personalDetails,
      addressDocumentUrl
    );

    res.json({
      success: true,
      data: result,
      message: 'KYC submitted successfully'
    });
  } catch (error: any) {
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
}

async getKYCStatus(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const status = await authService.getKYCStatus(parseInt(req.user.userId));
    
    res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

  async getUserStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await authService.getUserStatistics();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}