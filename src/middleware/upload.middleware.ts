// middleware/uploadMiddleware.ts
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { randomBytes, createHash } from 'crypto';
import { join, extname } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Generate secure filename
const generateSecureFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const randomHash = randomBytes(20).toString('hex');
  const fileHash = createHash('sha256')
    .update(`${originalName}${timestamp}${randomHash}`)
    .digest('hex')
    .substring(0, 40);
  
  const ext = extname(originalName);
  return `${fileHash}${ext}`;
};

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.body.category || 'general';
    const uploadDir = './uploads';
    const categoryDir = join(uploadDir, category);
    
    // Ensure upload directory exists
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    
    // Ensure category directory exists
    if (!existsSync(categoryDir)) {
      mkdirSync(categoryDir, { recursive: true });
    }
    
    cb(null, categoryDir);
  },
  filename: (req, file, cb) => {
    const secureFilename = generateSecureFilename(file.originalname);
    cb(null, secureFilename);
  }
});

// File filter for security
const fileFilter: any = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/avi', 'video/mov', 'video/webm',
    'audio/mp3', 'audio/wav', 'audio/ogg',
    'application/pdf',
    'text/plain', 'application/json'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10 // Max 10 files for multiple upload
  }
});

// Middleware for single file upload
export const uploadSingle = upload.single('file');

// Middleware for multiple files upload
export const uploadMultiple = upload.array('files', 10);

// Error handling middleware for multer errors
export const handleUploadError = (
  error: any, 
  req: Request, 
  res: Response, 
  next: NextFunction
): void => {
  if (error instanceof multer.MulterError) {
    let errorMessage = 'Upload error';
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        errorMessage = 'File size exceeds 100MB limit';
        break;
      case 'LIMIT_FILE_COUNT':
        errorMessage = 'Too many files. Maximum 10 files allowed';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        errorMessage = 'Unexpected file field';
        break;
      default:
        errorMessage = `Upload error: ${error.message}`;
    }
    
    res.status(400).json({
      success: false,
      error: errorMessage
    });
    return;
  }
  
  if (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Upload failed'
    });
    return;
  }
  
  next();
};

// FIXED CORS middleware for upload endpoints
export const uploadCors = (req: Request, res: Response, next: NextFunction): void => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
    // Add your production domains here
  ];
  
  const origin = req.headers.origin;
  
  // Check if the origin is allowed
  if (allowedOrigins.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  // Set other CORS headers
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
};

// Request logging middleware for uploads
export const uploadLogger = (req: Request, res: Response, next: NextFunction): void => {
  console.log(`Upload request: ${req.method} ${req.url}`, {
    body: req.body,
    files: req.file ? 1 : (req.files ? (req.files as any[]).length : 0),
    ip: req.ip,
    origin: req.headers.origin
  });
  next();
};

export default {
  uploadSingle,
  uploadMultiple,
  handleUploadError,
  uploadCors,
  uploadLogger
};