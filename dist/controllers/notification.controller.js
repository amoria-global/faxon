"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationController = void 0;
// In-memory storage for demo (replace with database in production)
let notifications = [];
let notificationCounter = 1;
// Generate some sample notifications for testing
const generateSampleNotifications = (userId) => {
    const types = ['info', 'warning', 'error', 'success'];
    const priorities = ['low', 'medium', 'high', 'urgent'];
    const categories = ['Booking', 'Payment', 'System', 'Security', 'Property', 'Guest Communication', 'Review', 'Maintenance'];
    const users = ['Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown', 'Emma Davis'];
    const notificationTemplates = [
        { title: 'New booking received', message: 'You have received a new booking for Ocean View Villa', type: 'success', category: 'Booking' },
        { title: 'Payment reminder', message: 'Payment is due for booking #BK00123', type: 'warning', category: 'Payment' },
        { title: 'System maintenance', message: 'Scheduled maintenance will occur tonight from 2-4 AM', type: 'info', category: 'System' },
        { title: 'Security alert', message: 'Multiple failed login attempts detected', type: 'error', category: 'Security' },
        { title: 'Property update required', message: 'Please update your property availability calendar', type: 'info', category: 'Property' },
        { title: 'Guest message', message: 'You have a new message from your guest', type: 'info', category: 'Guest Communication' },
        { title: 'Booking cancelled', message: 'A booking has been cancelled by the guest', type: 'warning', category: 'Booking' },
        { title: 'Payment received', message: 'Payment successfully processed for booking #BK00156', type: 'success', category: 'Payment' },
        { title: 'Review received', message: 'You have received a new 5-star review!', type: 'success', category: 'Review' },
        { title: 'Account verification', message: 'Please verify your account to continue using our services', type: 'warning', category: 'Security' },
        { title: 'Maintenance scheduled', message: 'Property maintenance scheduled for tomorrow', type: 'info', category: 'Maintenance' },
        { title: 'Booking confirmed', message: 'Your booking has been confirmed by the host', type: 'success', category: 'Booking' }
    ];
    return Array.from({ length: 42 }, (_, i) => {
        const template = notificationTemplates[i % notificationTemplates.length];
        const hoursAgo = Math.floor(Math.random() * 720); // Up to 30 days ago
        const timestamp = new Date();
        timestamp.setHours(timestamp.getHours() - hoursAgo);
        return {
            id: `NOT${String(notificationCounter + i).padStart(5, '0')}`,
            userId,
            title: template.title,
            message: template.message,
            type: template.type,
            category: template.category,
            priority: priorities[Math.floor(Math.random() * priorities.length)],
            timestamp,
            isRead: Math.random() > 0.4, // 60% read, 40% unread
            fromUser: Math.random() > 0.5 ? users[Math.floor(Math.random() * users.length)] : undefined,
            relatedEntity: Math.random() > 0.5 ? `BK${String(Math.floor(Math.random() * 999) + 1).padStart(5, '0')}` : undefined,
            actionUrl: Math.random() > 0.7 ? '/bookings' : undefined,
            metadata: {
                source: 'system',
                version: '1.0'
            }
        };
    });
};
exports.notificationController = {
    // Get notifications with filters and pagination
    async getNotifications(req, res) {
        try {
            // Get user ID from auth middleware (you'll need to add this)
            const userId = req.user?.id || 1; // Default to user ID 1 for testing
            // Initialize sample data if empty
            if (notifications.length === 0) {
                notifications = generateSampleNotifications(userId);
                notificationCounter += 42;
            }
            // Filter notifications for the user
            let userNotifications = notifications.filter(n => n.userId === userId);
            // Apply filters
            const { search, type, category, priority, status, // 'read' | 'unread' | 'all'
            sortField = 'timestamp', sortOrder = 'desc', page = 1, limit = 10 } = req.query;
            // Search filter
            if (search) {
                const searchTerm = search.toLowerCase();
                userNotifications = userNotifications.filter(notification => notification.title.toLowerCase().includes(searchTerm) ||
                    notification.message.toLowerCase().includes(searchTerm) ||
                    notification.category.toLowerCase().includes(searchTerm));
            }
            // Type filter
            if (type && type !== 'all') {
                userNotifications = userNotifications.filter(notification => notification.type === type);
            }
            // Category filter
            if (category && category !== 'all') {
                userNotifications = userNotifications.filter(notification => notification.category === category);
            }
            // Priority filter
            if (priority && priority !== 'all') {
                userNotifications = userNotifications.filter(notification => notification.priority === priority);
            }
            // Read status filter
            if (status && status !== 'all') {
                const isRead = status === 'read';
                userNotifications = userNotifications.filter(notification => notification.isRead === isRead);
            }
            // Sorting
            userNotifications.sort((a, b) => {
                let comparison = 0;
                switch (sortField) {
                    case 'timestamp':
                        comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                        break;
                    case 'priority':
                        const priorityOrder = { 'low': 1, 'medium': 2, 'high': 3, 'urgent': 4 };
                        comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
                        break;
                    case 'category':
                        comparison = a.category.localeCompare(b.category);
                        break;
                    case 'type':
                        comparison = a.type.localeCompare(b.type);
                        break;
                }
                return sortOrder === 'asc' ? comparison : -comparison;
            });
            // Pagination
            const pageNum = parseInt(page, 10);
            const limitNum = parseInt(limit, 10);
            const startIndex = (pageNum - 1) * limitNum;
            const endIndex = startIndex + limitNum;
            const paginatedNotifications = userNotifications.slice(startIndex, endIndex);
            // Calculate stats
            const unreadCount = notifications.filter(n => n.userId === userId && !n.isRead).length;
            const urgentCount = notifications.filter(n => n.userId === userId && n.priority === 'urgent').length;
            const uniqueCategories = [...new Set(notifications.filter(n => n.userId === userId).map(n => n.category))];
            res.json({
                success: true,
                message: 'Notifications fetched successfully',
                data: {
                    notifications: paginatedNotifications,
                    total: userNotifications.length,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(userNotifications.length / limitNum),
                    stats: {
                        unreadCount,
                        urgentCount,
                        categories: uniqueCategories
                    }
                }
            });
        }
        catch (error) {
            console.error('Error fetching notifications:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch notifications',
                errors: [error.message]
            });
        }
    },
    // Get single notification
    async getNotification(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id || 1;
            const notification = notifications.find(n => n.id === id && n.userId === userId);
            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found'
                });
            }
            res.json({
                success: true,
                message: 'Notification fetched successfully',
                data: notification
            });
        }
        catch (error) {
            console.error('Error fetching notification:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch notification',
                errors: [error.message]
            });
        }
    },
    // Mark notification as read
    async markAsRead(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id || 1;
            const notificationIndex = notifications.findIndex(n => n.id === id && n.userId === userId);
            if (notificationIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found'
                });
            }
            notifications[notificationIndex].isRead = true;
            res.json({
                success: true,
                message: 'Notification marked as read',
                data: notifications[notificationIndex]
            });
        }
        catch (error) {
            console.error('Error marking notification as read:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark notification as read',
                errors: [error.message]
            });
        }
    },
    // Mark notification as unread
    async markAsUnread(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id || 1;
            const notificationIndex = notifications.findIndex(n => n.id === id && n.userId === userId);
            if (notificationIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found'
                });
            }
            notifications[notificationIndex].isRead = false;
            res.json({
                success: true,
                message: 'Notification marked as unread',
                data: notifications[notificationIndex]
            });
        }
        catch (error) {
            console.error('Error marking notification as unread:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark notification as unread',
                errors: [error.message]
            });
        }
    },
    // Mark all notifications as read
    async markAllAsRead(req, res) {
        try {
            const userId = req.user?.id || 1;
            notifications = notifications.map(notification => notification.userId === userId
                ? { ...notification, isRead: true }
                : notification);
            const updatedCount = notifications.filter(n => n.userId === userId).length;
            res.json({
                success: true,
                message: `${updatedCount} notifications marked as read`,
                data: { updatedCount }
            });
        }
        catch (error) {
            console.error('Error marking all notifications as read:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark all notifications as read',
                errors: [error.message]
            });
        }
    },
    // Delete notification
    async deleteNotification(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id || 1;
            const notificationIndex = notifications.findIndex(n => n.id === id && n.userId === userId);
            if (notificationIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found'
                });
            }
            notifications.splice(notificationIndex, 1);
            res.json({
                success: true,
                message: 'Notification deleted successfully'
            });
        }
        catch (error) {
            console.error('Error deleting notification:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete notification',
                errors: [error.message]
            });
        }
    },
    // Create notification (for system use)
    async createNotification(req, res) {
        try {
            const { userId, title, message, type = 'info', category = 'System', priority = 'medium', actionUrl, fromUser, relatedEntity, metadata, expiresAt } = req.body;
            if (!userId || !title || !message) {
                return res.status(400).json({
                    success: false,
                    message: 'userId, title, and message are required'
                });
            }
            const newNotification = {
                id: `NOT${String(++notificationCounter).padStart(5, '0')}`,
                userId,
                title,
                message,
                type,
                category,
                priority,
                timestamp: new Date(),
                isRead: false,
                actionUrl,
                fromUser,
                relatedEntity,
                metadata,
                expiresAt: expiresAt ? new Date(expiresAt) : undefined
            };
            notifications.push(newNotification);
            res.status(201).json({
                success: true,
                message: 'Notification created successfully',
                data: newNotification
            });
        }
        catch (error) {
            console.error('Error creating notification:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create notification',
                errors: [error.message]
            });
        }
    },
    // Get notification statistics
    async getStats(req, res) {
        try {
            const userId = req.user?.id || 1;
            const userNotifications = notifications.filter(n => n.userId === userId);
            const stats = {
                total: userNotifications.length,
                unread: userNotifications.filter(n => !n.isRead).length,
                urgent: userNotifications.filter(n => n.priority === 'urgent').length,
                byType: {
                    info: userNotifications.filter(n => n.type === 'info').length,
                    success: userNotifications.filter(n => n.type === 'success').length,
                    warning: userNotifications.filter(n => n.type === 'warning').length,
                    error: userNotifications.filter(n => n.type === 'error').length
                },
                byCategory: userNotifications.reduce((acc, n) => {
                    acc[n.category] = (acc[n.category] || 0) + 1;
                    return acc;
                }, {}),
                categories: [...new Set(userNotifications.map(n => n.category))]
            };
            res.json({
                success: true,
                message: 'Notification statistics fetched successfully',
                data: stats
            });
        }
        catch (error) {
            console.error('Error fetching notification stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch notification statistics',
                errors: [error.message]
            });
        }
    }
};
