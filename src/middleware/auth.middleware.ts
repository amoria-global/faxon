import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { JwtPayload } from '../types/auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Role-based authentication middleware
export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const userType = req.user.userType || 'guest';
    
    if (!allowedRoles.includes(userType)) {
      return res.status(403).json({ 
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}` 
      });
    }

    next();
  };
};

// Service provider authentication (host, tourguide, agent)
export const authenticateServiceProvider = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  const serviceProviderTypes = ['host', 'tourguide', 'agent', 'admin'];
  const userType = req.user.userType || 'guest';
  
  if (!serviceProviderTypes.includes(userType)) {
    return res.status(403).json({ 
      message: 'Access denied. Service providers only.' 
    });
  }

  next();
};

// Admin only middleware
export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  if (req.user.userType !== 'admin') {
    return res.status(403).json({ 
      message: 'Access denied. Admin only.' 
    });
  }

  next();
};

// Check if user can access a resource (own data or admin)
export const canAccessUserData = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  const requestedUserId = parseInt(req.params.userId || req.params.id || '0');
  const currentUserId = parseInt(req.user.userId);
  const isAdmin = req.user.userType === 'admin';

  if (requestedUserId && requestedUserId !== currentUserId && !isAdmin) {
    return res.status(403).json({ 
      message: 'Access denied. You can only access your own data.' 
    });
  }

  next();
};