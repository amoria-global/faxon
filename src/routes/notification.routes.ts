// routes/notification.routes.ts
import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';

const router = Router();

// Optional: Add authentication middleware here
// const authMiddleware = (req: any, res: any, next: any) => {
//   // Mock auth for testing - replace with your actual auth middleware
//   req.user = { id: 1, email: 'test@example.com' };
//   next();
// };

// Routes
router.get('/stats', notificationController.getStats);
router.get('/', notificationController.getNotifications);
router.get('/:id', notificationController.getNotification);
router.post('/', notificationController.createNotification);
router.patch('/:id/read', notificationController.markAsRead);
router.patch('/:id/unread', notificationController.markAsUnread);
router.patch('/mark-all-read', notificationController.markAllAsRead);
router.delete('/:id', notificationController.deleteNotification);

export default router;