// services/uploadService.ts
import { randomBytes, createHash } from 'crypto';
import { join, extname } from 'path';
import { existsSync, mkdirSync } from 'fs';

interface UploadResult {
  success: boolean;
  data?: {
    url: string;
    filename: string;
    originalName: string;
    size: number;
    mimeType: string;
    category: string;
    uploadTime: string;
  };
  error?: string;
}

interface MultipleUploadResult {
  success: boolean;
  data?: {
    files: Array<{
      url: string;
      filename: string;
      originalName: string;
      size: number;
      mimeType: string;
    }>;
    count: number;
    category: string;
    uploadTime: string;
  };
  error?: string;
}

class UploadService {
  private readonly UPLOAD_DIR = './uploads';
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  
  private readonly ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/avi', 'video/mov', 'video/webm',
    'audio/mp3', 'audio/wav', 'audio/ogg',
    'application/pdf',
    'text/plain', 'application/json'
  ];

  constructor() {
    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory(): void {
    if (!existsSync(this.UPLOAD_DIR)) {
      mkdirSync(this.UPLOAD_DIR, { recursive: true });
    }
  }

  private generateSecureFilename(originalName: string): string {
    const timestamp = Date.now();
    const randomHash = randomBytes(20).toString('hex');
    const fileHash = createHash('sha256')
      .update(`${originalName}${timestamp}${randomHash}`)
      .digest('hex')
      .substring(0, 40);
    
    const ext = extname(originalName);
    return `${fileHash}${ext}`;
  }

  private ensureCategoryDirectory(category: string): string {
    const categoryDir = join(this.UPLOAD_DIR, category);
    
    if (!existsSync(categoryDir)) {
      mkdirSync(categoryDir, { recursive: true });
    }
    
    return categoryDir;
  }

  private generateSecureUrl(baseUrl: string, category: string, filename: string): string {
    return `${baseUrl}/uploads/${category}/${filename}`;
  }

  private validateFile(file: Express.Multer.File): { isValid: boolean; error?: string } {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return { isValid: false, error: 'File size exceeds 100MB limit' };
    }

    // Check mime type
    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return { isValid: false, error: `File type ${file.mimetype} not allowed` };
    }

    return { isValid: true };
  }

  public async uploadSingle(
    file: Express.Multer.File, 
    category: string = 'general',
    baseUrl: string
  ): Promise<UploadResult> {
    try {
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error
        };
      }

      const secureUrl = this.generateSecureUrl(baseUrl, category, file.filename);

      return {
        success: true,
        data: {
          url: secureUrl,
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          category,
          uploadTime: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Upload service error:', error);
      return {
        success: false,
        error: 'Upload processing failed'
      };
    }
  }

  public async uploadMultiple(
    files: Express.Multer.File[],
    category: string = 'general',
    baseUrl: string
  ): Promise<MultipleUploadResult> {
    try {
      if (!files || files.length === 0) {
        return {
          success: false,
          error: 'No files provided'
        };
      }

      // Validate all files
      for (const file of files) {
        const validation = this.validateFile(file);
        if (!validation.isValid) {
          return {
            success: false,
            error: `File ${file.originalname}: ${validation.error}`
          };
        }
      }

      const uploadedFiles = files.map(file => ({
        url: this.generateSecureUrl(baseUrl, category, file.filename),
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      }));

      return {
        success: true,
        data: {
          files: uploadedFiles,
          count: uploadedFiles.length,
          category,
          uploadTime: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Multiple upload service error:', error);
      return {
        success: false,
        error: 'Multiple upload processing failed'
      };
    }
  }

  public getUploadInfo() {
    return {
      maxFileSize: '100MB',
      allowedTypes: this.ALLOWED_MIME_TYPES,
      uploadEndpoints: {
        single: '/api/upload',
        multiple: '/api/upload/multiple'
      }
    };
  }
}

export default new UploadService();