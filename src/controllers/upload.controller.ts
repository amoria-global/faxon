// controllers/uploadController.ts
import { Request, Response } from 'express';
import uploadService from '../services/upload.service';

class UploadController {
  
  public async uploadSingle(req: Request, res: Response): Promise<void> {
    try {
      console.log('Single file upload request received');

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
        return;
      }

      const category = req.body.category || 'general';
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

      const result = await uploadService.uploadSingle(req.file, category, baseUrl);

      if (result.success) {
        console.log('File uploaded successfully:', result.data?.url);
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('Upload controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async uploadMultiple(req: Request, res: Response): Promise<void> {
    try {
      console.log('Multiple files upload request received');

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
        return;
      }

      const category = req.body.category || 'general';
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

      const result = await uploadService.uploadMultiple(req.files, category, baseUrl);

      if (result.success) {
        console.log(`${result.data?.count} files uploaded successfully`);
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('Multiple upload controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async getUploadInfo(req: Request, res: Response): Promise<void> {
    try {
      const info = uploadService.getUploadInfo();
      res.status(200).json({
        success: true,
        data: info
      });
    } catch (error) {
      console.error('Upload info error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get upload info'
      });
    }
  }

  public async serveFile(req: Request, res: Response): Promise<void> {
    try {
      const { category, filename } = req.params;
      
      // Security validation
      if (!/^[a-zA-Z0-9._-]+$/.test(filename) || 
          !/^[a-zA-Z0-9_-]+$/.test(category)) {
        res.status(400).json({ 
          success: false,
          error: 'Invalid file path' 
        });
        return;
      }

      const filePath = `./uploads/${category}/${filename}`;
      
      // Set appropriate headers
      const ext = filename.split('.').pop()?.toLowerCase();
      const mimeTypes: { [key: string]: string } = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'pdf': 'application/pdf'
      };
      
      if (ext && mimeTypes[ext]) {
        res.setHeader('Content-Type', mimeTypes[ext]);
      }
      
      // Cache headers
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      
      res.sendFile(filePath, { root: '.' }, (err) => {
        if (err) {
          console.error('File serve error:', err);
          res.status(404).json({ 
            success: false,
            error: 'File not found' 
          });
        }
      });

    } catch (error) {
      console.error('File serve error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Server error' 
      });
    }
  }
}

export default new UploadController();