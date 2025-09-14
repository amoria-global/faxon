"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/notification.routes.ts
const express_1 = require("express");
const notification_controller_1 = require("../controllers/notification.controller");
const router = (0, express_1.Router)();
// Optional: Add authentication middleware here
// const authMiddleware = (req: any, res: any, next: any) => {
//   // Mock auth for testing - replace with your actual auth middleware
//   req.user = { id: 1, email: 'test@example.com' };
//   next();
// };
// Routes
router.get('/stats', notification_controller_1.notificationController.getStats);
router.get('/', notification_controller_1.notificationController.getNotifications);
router.get('/:id', notification_controller_1.notificationController.getNotification);
router.post('/', notification_controller_1.notificationController.createNotification);
router.patch('/:id/read', notification_controller_1.notificationController.markAsRead);
router.patch('/:id/unread', notification_controller_1.notificationController.markAsUnread);
router.patch('/mark-all-read', notification_controller_1.notificationController.markAllAsRead);
router.delete('/:id', notification_controller_1.notificationController.deleteNotification);
exports.default = router;
