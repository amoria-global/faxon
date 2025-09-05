// src/types/express.d.ts

import { JwtPayload } from 'jsonwebtoken';

// Define the structure of your custom JWT payload
interface CustomJwtPayload extends JwtPayload {
  id: string;
  userType: 'user' | 'tourguide' | 'admin';
  // Add any other properties you have in your JWT payload
}

declare global {
  namespace Express {
    export interface Request {
      user?: CustomJwtPayload;
    }
  }
}