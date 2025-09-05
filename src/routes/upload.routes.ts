// routes/uploadRoutes.ts
import { Router } from 'express';
import uploadController from '../controllers/upload.controller';
import {
  handleUploadError,
  uploadCors,
  uploadLogger
} from '../middleware/upload.middleware';

const router = Router();

// Apply CORS to all upload routes
router.use(uploadCors);

// Apply logging to all upload routes
router.use(uploadLogger);

// Single file upload route
router.post('/single', 
  handleUploadError,
  uploadController.uploadSingle
);

// Multiple files upload route
router.post('/multiple',
  handleUploadError,
  uploadController.uploadMultiple
);

// Get upload configuration info
router.get('/info',
  uploadController.getUploadInfo
);

// Serve uploaded files
router.get('/:category/:filename',
  uploadController.serveFile
);

export default router;

// Alternative export if you prefer named exports
export { router as uploadRoutes };