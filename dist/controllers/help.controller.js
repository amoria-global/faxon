"use strict";
// backend/src/controllers/help.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHelpStats = exports.sendContactMessage = exports.getHelpCategories = exports.closeSupportTicket = exports.addTicketResponse = exports.updateSupportTicket = exports.createSupportTicket = exports.getSupportTicket = exports.getSupportTickets = exports.incrementArticleViews = exports.getArticle = exports.getArticles = exports.markFAQHelpful = exports.getFAQ = exports.getFAQs = void 0;
// Mock data for testing - replace with database queries
const mockFAQs = [
    {
        id: 'faq-1',
        question: 'How do I create an account or log in?',
        answer: 'To create a new account, click the "Sign Up" button on the homepage and follow the prompts. If you already have an account, click "Log In" and enter your credentials. You can also sign in using your Google or Facebook account for faster access.',
        category: 'Getting Started',
        tags: ['account', 'login', 'signup', 'authentication'],
        helpful: 245,
        lastUpdated: new Date('2025-01-15'),
        priority: 'high',
        isActive: true,
        createdAt: new Date('2025-01-15').toISOString(),
        updatedAt: new Date('2025-01-15').toISOString()
    },
    {
        id: 'faq-2',
        question: 'How to view booking status and history?',
        answer: 'Your booking history is available in the "My Bookings" section of your profile. Here you can see past and upcoming bookings, track their current status, view receipts, and manage cancellations or modifications.',
        category: 'Booking Management',
        tags: ['bookings', 'history', 'status', 'tracking'],
        helpful: 189,
        lastUpdated: new Date('2025-01-12'),
        priority: 'high',
        isActive: true,
        createdAt: new Date('2025-01-12').toISOString(),
        updatedAt: new Date('2025-01-12').toISOString()
    },
    {
        id: 'faq-3',
        question: 'What payment methods are accepted?',
        answer: 'We accept all major credit cards (Visa, MasterCard, American Express), PayPal, Apple Pay, Google Pay, and bank transfers. You can add or update your payment information in your Account Settings under the Payment & Billing section.',
        category: 'Payment & Billing',
        tags: ['payment', 'credit card', 'paypal', 'billing'],
        helpful: 156,
        lastUpdated: new Date('2025-01-10'),
        priority: 'high',
        isActive: true,
        createdAt: new Date('2025-01-10').toISOString(),
        updatedAt: new Date('2025-01-10').toISOString()
    },
    {
        id: 'faq-4',
        question: 'How to modify or cancel bookings?',
        answer: 'Modifying or canceling a booking can be done from the "My Bookings" page. Select the booking you wish to change and follow the on-screen instructions. Note that cancellation policies may apply and vary by property.',
        category: 'Booking Management',
        tags: ['cancel', 'modify', 'change', 'refund'],
        helpful: 134,
        lastUpdated: new Date('2025-01-08'),
        priority: 'medium',
        isActive: true,
        createdAt: new Date('2025-01-08').toISOString(),
        updatedAt: new Date('2025-01-08').toISOString()
    },
    {
        id: 'faq-5',
        question: 'How to reset my password?',
        answer: 'If you forget your password, click "Forgot Password" on the login screen. We will send a password reset link to your registered email address. Follow the instructions in the email to create a new password.',
        category: 'Account & Profile',
        tags: ['password', 'reset', 'forgot', 'security'],
        helpful: 98,
        lastUpdated: new Date('2025-01-05'),
        priority: 'medium',
        isActive: true,
        createdAt: new Date('2025-01-05').toISOString(),
        updatedAt: new Date('2025-01-05').toISOString()
    },
    {
        id: 'faq-6',
        question: 'My booking is not showing up, what should I do?',
        answer: 'There might be a slight delay in data synchronization. Please try refreshing the page and clearing your browser cache. If the issue persists, contact our support team with your booking confirmation number.',
        category: 'Troubleshooting',
        tags: ['booking', 'missing', 'sync', 'technical'],
        helpful: 76,
        lastUpdated: new Date('2025-01-03'),
        priority: 'medium',
        isActive: true,
        createdAt: new Date('2025-01-03').toISOString(),
        updatedAt: new Date('2025-01-03').toISOString()
    }
];
const mockArticles = [
    {
        id: 'art-1',
        title: 'Complete Guide to Making Your First Booking',
        content: 'Step-by-step guide to help you navigate our platform and make your first successful booking. This comprehensive guide covers everything from creating an account to completing your payment and receiving confirmation.',
        excerpt: 'Learn how to make your first booking with our detailed step-by-step guide.',
        category: 'Getting Started',
        readTime: 5,
        views: 1245,
        lastUpdated: new Date('2025-01-18'),
        isPublished: true,
        author: 'Support Team',
        tags: ['booking', 'guide', 'tutorial'],
        createdAt: new Date('2025-01-18').toISOString(),
        updatedAt: new Date('2025-01-18').toISOString()
    },
    {
        id: 'art-2',
        title: 'Understanding Our Cancellation Policies',
        content: 'Detailed explanation of different cancellation policies and how they affect your bookings. Learn about flexible, moderate, and strict cancellation policies, and how to choose properties that match your travel flexibility needs.',
        excerpt: 'Everything you need to know about our cancellation policies and refund process.',
        category: 'Booking Management',
        readTime: 8,
        views: 892,
        lastUpdated: new Date('2025-01-16'),
        isPublished: true,
        author: 'Policy Team',
        tags: ['cancellation', 'refund', 'policy'],
        createdAt: new Date('2025-01-16').toISOString(),
        updatedAt: new Date('2025-01-16').toISOString()
    },
    {
        id: 'art-3',
        title: 'Payment Security and Best Practices',
        content: 'Learn about our security measures and how to keep your payment information safe. We use industry-standard encryption and security protocols to protect your financial data.',
        excerpt: 'Understand how we protect your payment information and best practices for secure transactions.',
        category: 'Payment & Billing',
        readTime: 6,
        views: 567,
        lastUpdated: new Date('2025-01-14'),
        isPublished: true,
        author: 'Security Team',
        tags: ['security', 'payment', 'safety'],
        createdAt: new Date('2025-01-14').toISOString(),
        updatedAt: new Date('2025-01-14').toISOString()
    }
];
// Mock tickets storage (replace with database)
let mockTickets = [
    {
        id: 'TKT-001',
        subject: 'Payment failed for booking',
        description: 'My payment was declined but I\'m not sure why. I tried multiple cards and they all fail.',
        category: 'Payment & Billing',
        priority: 'high',
        status: 'in-progress',
        userId: 1,
        assignedTo: null,
        responses: [],
        createdAt: new Date('2025-01-20').toISOString(),
        updatedAt: new Date('2025-01-20').toISOString()
    }
];
// Helper function to handle errors safely
const getErrorMessage = (error) => {
    if (error instanceof Error) {
        return error.message;
    }
    return 'An unknown error occurred';
};
// Helper function to filter and sort items
const filterAndSort = (items, filters) => {
    let filtered = [...items];
    // Apply search filter
    if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filtered = filtered.filter(item => {
            const searchFields = [
                item.question || item.title || item.subject,
                item.answer || item.content || item.description,
                ...(item.tags || []),
                item.category
            ].filter(Boolean);
            return searchFields.some(field => field.toLowerCase().includes(searchTerm));
        });
    }
    // Apply category filter
    if (filters.category && filters.category !== 'all') {
        filtered = filtered.filter(item => item.category === filters.category);
    }
    // Apply status filter (for tickets)
    if (filters.status && filters.status !== 'all') {
        filtered = filtered.filter(item => item.status === filters.status);
    }
    // Apply priority filter
    if (filters.priority && filters.priority !== 'all') {
        filtered = filtered.filter(item => item.priority === filters.priority);
    }
    // Apply sorting
    filtered.sort((a, b) => {
        const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
        switch (filters.sortBy) {
            case 'date':
                const dateA = new Date(a.lastUpdated || a.updatedAt || a.createdAt);
                const dateB = new Date(b.lastUpdated || b.updatedAt || b.createdAt);
                return (dateB.getTime() - dateA.getTime()) * sortOrder;
            case 'popularity':
                return ((b.helpful || b.views || 0) - (a.helpful || a.views || 0)) * sortOrder;
            case 'category':
                return a.category.localeCompare(b.category) * sortOrder;
            default:
                return 0;
        }
    });
    return filtered;
};
// Helper function for pagination
const paginate = (items, page, limit) => {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedItems = items.slice(startIndex, endIndex);
    return {
        items: paginatedItems,
        total: items.length,
        page,
        limit,
        totalPages: Math.ceil(items.length / limit)
    };
};
// ============ FAQ CONTROLLERS ============
const getFAQs = async (req, res) => {
    try {
        const { search, category, sortBy = 'relevance', sortOrder = 'desc', page = 1, limit = 12 } = req.query;
        const filters = {
            search: search,
            category: category,
            sortBy: sortBy,
            sortOrder: sortOrder
        };
        // Filter and sort FAQs
        const filteredFAQs = filterAndSort(mockFAQs.filter(faq => faq.isActive), filters);
        // Paginate results
        const paginatedResult = paginate(filteredFAQs, parseInt(page), parseInt(limit));
        // Get unique categories
        const categories = [...new Set(mockFAQs.map(faq => faq.category))];
        const response = {
            success: true,
            message: 'FAQs retrieved successfully',
            data: {
                ...paginatedResult,
                categories
            }
        };
        res.status(200).json(response);
    }
    catch (error) {
        console.error('Error fetching FAQs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch FAQs',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.getFAQs = getFAQs;
const getFAQ = async (req, res) => {
    try {
        const { faqId } = req.params;
        const faq = mockFAQs.find(f => f.id === faqId && f.isActive);
        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found',
                errors: [`FAQ with ID '${faqId}' does not exist`]
            });
        }
        res.status(200).json({
            success: true,
            message: 'FAQ retrieved successfully',
            data: faq
        });
    }
    catch (error) {
        console.error('Error fetching FAQ:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch FAQ',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.getFAQ = getFAQ;
const markFAQHelpful = async (req, res) => {
    try {
        const { faqId } = req.params;
        const faqIndex = mockFAQs.findIndex(f => f.id === faqId);
        if (faqIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found',
                errors: [`FAQ with ID '${faqId}' does not exist`]
            });
        }
        // Increment helpful count
        mockFAQs[faqIndex].helpful += 1;
        mockFAQs[faqIndex].updatedAt = new Date().toISOString();
        res.status(200).json({
            success: true,
            message: 'FAQ marked as helpful',
            data: {
                helpful: mockFAQs[faqIndex].helpful
            }
        });
    }
    catch (error) {
        console.error('Error marking FAQ as helpful:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark FAQ as helpful',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.markFAQHelpful = markFAQHelpful;
// ============ ARTICLE CONTROLLERS ============
const getArticles = async (req, res) => {
    try {
        const { search, category, sortBy = 'date', sortOrder = 'desc', page = 1, limit = 12 } = req.query;
        const filters = {
            search: search,
            category: category,
            sortBy: sortBy,
            sortOrder: sortOrder
        };
        // Filter and sort articles
        const filteredArticles = filterAndSort(mockArticles.filter(article => article.isPublished), filters);
        // Parse pagination parameters safely
        const pageNumber = typeof page === 'string' ? parseInt(page) : (typeof page === 'number' ? page : 1);
        const limitNumber = typeof limit === 'string' ? parseInt(limit) : (typeof limit === 'number' ? limit : 12);
        // Paginate results
        const paginatedResult = paginate(filteredArticles, pageNumber, limitNumber);
        // Get unique categories
        const categories = [...new Set(mockArticles.map(article => article.category))];
        res.status(200).json({
            success: true,
            message: 'Articles retrieved successfully',
            data: {
                ...paginatedResult,
                categories
            }
        });
    }
    catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch articles',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.getArticles = getArticles;
const getArticle = async (req, res) => {
    try {
        const { articleId } = req.params;
        const article = mockArticles.find(a => a.id === articleId && a.isPublished);
        if (!article) {
            return res.status(404).json({
                success: false,
                message: 'Article not found',
                errors: [`Article with ID '${articleId}' does not exist`]
            });
        }
        res.status(200).json({
            success: true,
            message: 'Article retrieved successfully',
            data: article
        });
    }
    catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch article',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.getArticle = getArticle;
const incrementArticleViews = async (req, res) => {
    try {
        const { articleId } = req.params;
        const articleIndex = mockArticles.findIndex(a => a.id === articleId);
        if (articleIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Article not found',
                errors: [`Article with ID '${articleId}' does not exist`]
            });
        }
        // Increment views
        mockArticles[articleIndex].views += 1;
        mockArticles[articleIndex].updatedAt = new Date().toISOString();
        res.status(200).json({
            success: true,
            message: 'Article views incremented',
            data: {
                views: mockArticles[articleIndex].views
            }
        });
    }
    catch (error) {
        console.error('Error incrementing article views:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to increment article views',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.incrementArticleViews = incrementArticleViews;
// ============ SUPPORT TICKET CONTROLLERS ============
const getSupportTickets = async (req, res) => {
    try {
        const userIdString = req.user?.userId;
        const { search, category, status, priority, sortBy = 'date', sortOrder = 'desc', page = 1, limit = 12 } = req.query;
        // Filter tickets by user (unless admin)
        let userTickets = mockTickets;
        if (req.user?.userType !== 'admin') {
            // ** FIX START **
            if (!userIdString) {
                return res.status(401).json({ success: false, message: 'User not authenticated', errors: ['User ID not found'] });
            }
            const numericUserId = parseInt(userIdString, 10);
            userTickets = mockTickets.filter(ticket => ticket.userId === numericUserId);
            // ** FIX END **
        }
        const filters = {
            search: search,
            category: category,
            status: status,
            priority: priority,
            sortBy: sortBy,
            sortOrder: sortOrder
        };
        // Filter and sort tickets
        const filteredTickets = filterAndSort(userTickets, filters);
        // Paginate results
        const paginatedResult = paginate(filteredTickets, parseInt(page), parseInt(limit));
        // Get unique categories
        const categories = [...new Set(mockTickets.map(ticket => ticket.category))];
        res.status(200).json({
            success: true,
            message: 'Support tickets retrieved successfully',
            data: {
                ...paginatedResult,
                categories
            }
        });
    }
    catch (error) {
        console.error('Error fetching support tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch support tickets',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.getSupportTickets = getSupportTickets;
const getSupportTicket = async (req, res) => {
    try {
        const { ticketId } = req.params;
        // ** FIX START **
        const userIdString = req.user?.userId;
        // ** FIX END **
        const ticket = mockTickets.find(t => t.id === ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found',
                errors: [`Ticket with ID '${ticketId}' does not exist`]
            });
        }
        // ** FIX START **
        // Check if user can access this ticket
        const numericUserId = userIdString ? parseInt(userIdString, 10) : undefined;
        if (req.user?.userType !== 'admin' && ticket.userId !== numericUserId) {
            // ** FIX END **
            return res.status(403).json({
                success: false,
                message: 'Access denied',
                errors: ['You can only access your own tickets']
            });
        }
        res.status(200).json({
            success: true,
            message: 'Support ticket retrieved successfully',
            data: ticket
        });
    }
    catch (error) {
        console.error('Error fetching support ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch support ticket',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.getSupportTicket = getSupportTicket;
const createSupportTicket = async (req, res) => {
    try {
        // ** FIX START **
        const userIdString = req.user?.userId;
        // ** FIX END **
        const { subject, description, category = 'general', priority = 'medium' } = req.body;
        // Validation
        if (!subject || !description) {
            return res.status(400).json({
                success: false,
                message: 'Subject and description are required',
                errors: ['Missing required fields']
            });
        }
        // ** FIX START **
        if (!userIdString) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated',
                errors: ['User ID not found']
            });
        }
        const numericUserId = parseInt(userIdString, 10);
        // ** FIX END **
        // Generate ticket ID
        const ticketNumber = String(mockTickets.length + 1).padStart(3, '0');
        const newTicket = {
            id: `TKT-${ticketNumber}`,
            subject,
            description,
            category,
            priority,
            status: 'open',
            userId: numericUserId, // ** FIXED **
            assignedTo: null,
            responses: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        mockTickets.push(newTicket);
        res.status(201).json({
            success: true,
            message: 'Support ticket created successfully',
            data: newTicket
        });
    }
    catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create support ticket',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.createSupportTicket = createSupportTicket;
const updateSupportTicket = async (req, res) => {
    try {
        const { ticketId } = req.params;
        // ** FIX START **
        const userIdString = req.user?.userId;
        // ** FIX END **
        const updateData = req.body;
        const ticketIndex = mockTickets.findIndex(t => t.id === ticketId);
        if (ticketIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found',
                errors: [`Ticket with ID '${ticketId}' does not exist`]
            });
        }
        // ** FIX START **
        // Check if user can update this ticket
        const numericUserId = userIdString ? parseInt(userIdString, 10) : undefined;
        if (req.user?.userType !== 'admin' && mockTickets[ticketIndex].userId !== numericUserId) {
            // ** FIX END **
            return res.status(403).json({
                success: false,
                message: 'Access denied',
                errors: ['You can only update your own tickets']
            });
        }
        // Update ticket
        mockTickets[ticketIndex] = {
            ...mockTickets[ticketIndex],
            ...updateData,
            updatedAt: new Date().toISOString()
        };
        res.status(200).json({
            success: true,
            message: 'Support ticket updated successfully',
            data: mockTickets[ticketIndex]
        });
    }
    catch (error) {
        console.error('Error updating support ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update support ticket',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.updateSupportTicket = updateSupportTicket;
const addTicketResponse = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { message } = req.body;
        // ** FIX START **
        const userIdString = req.user?.userId;
        // ** FIX END **
        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message is required',
                errors: ['Message cannot be empty']
            });
        }
        // ** FIX START **
        if (!userIdString) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated',
                errors: ['User ID not found']
            });
        }
        const numericUserId = parseInt(userIdString, 10);
        // ** FIX END **
        const ticketIndex = mockTickets.findIndex(t => t.id === ticketId);
        if (ticketIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found',
                errors: [`Ticket with ID '${ticketId}' does not exist`]
            });
        }
        // ** FIX START **
        // Check if user can add response to this ticket
        if (req.user?.userType !== 'admin' && mockTickets[ticketIndex].userId !== numericUserId) {
            // ** FIX END **
            return res.status(403).json({
                success: false,
                message: 'Access denied',
                errors: ['You can only respond to your own tickets']
            });
        }
        const newResponse = {
            id: `resp-${Date.now()}`,
            ticketId,
            message,
            isFromSupport: req.user?.userType === 'admin',
            createdAt: new Date().toISOString(),
            createdBy: numericUserId // ** FIXED **
        };
        // Initialize responses array if it doesn't exist
        if (!mockTickets[ticketIndex].responses) {
            mockTickets[ticketIndex].responses = [];
        }
        mockTickets[ticketIndex].responses.push(newResponse);
        mockTickets[ticketIndex].updatedAt = new Date().toISOString();
        res.status(201).json({
            success: true,
            message: 'Ticket response added successfully',
            data: newResponse
        });
    }
    catch (error) {
        console.error('Error adding ticket response:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add ticket response',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.addTicketResponse = addTicketResponse;
const closeSupportTicket = async (req, res) => {
    try {
        const { ticketId } = req.params;
        // ** FIX START **
        const userIdString = req.user?.userId;
        // ** FIX END **
        const ticketIndex = mockTickets.findIndex(t => t.id === ticketId);
        if (ticketIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found',
                errors: [`Ticket with ID '${ticketId}' does not exist`]
            });
        }
        // ** FIX START **
        // Check if user can close this ticket
        const numericUserId = userIdString ? parseInt(userIdString, 10) : undefined;
        if (req.user?.userType !== 'admin' && mockTickets[ticketIndex].userId !== numericUserId) {
            // ** FIX END **
            return res.status(403).json({
                success: false,
                message: 'Access denied',
                errors: ['You can only close your own tickets']
            });
        }
        // Close ticket
        mockTickets[ticketIndex].status = 'closed';
        mockTickets[ticketIndex].updatedAt = new Date().toISOString();
        res.status(200).json({
            success: true,
            message: 'Support ticket closed successfully',
            data: {
                id: ticketId,
                status: 'closed',
                updatedAt: mockTickets[ticketIndex].updatedAt
            }
        });
    }
    catch (error) {
        console.error('Error closing support ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to close support ticket',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.closeSupportTicket = closeSupportTicket;
// ============ GENERAL HELP CONTROLLERS ============
const getHelpCategories = async (req, res) => {
    try {
        // Combine categories from all content types
        const faqCategories = [...new Set(mockFAQs.map(faq => faq.category))];
        const articleCategories = [...new Set(mockArticles.map(article => article.category))];
        const ticketCategories = [...new Set(mockTickets.map(ticket => ticket.category))];
        const allCategories = [...new Set([...faqCategories, ...articleCategories, ...ticketCategories])];
        res.status(200).json({
            success: true,
            message: 'Help categories retrieved successfully',
            data: allCategories.sort()
        });
    }
    catch (error) {
        console.error('Error fetching help categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch help categories',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.getHelpCategories = getHelpCategories;
const sendContactMessage = async (req, res) => {
    try {
        const { subject, category, message, email, name } = req.body;
        // Validation
        if (!subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'Subject and message are required',
                errors: ['Missing required fields']
            });
        }
        // TODO: Implement email sending logic or database storage
        // For now, just return success
        const contactData = {
            id: `contact-${Date.now()}`,
            subject,
            category: category || 'General Inquiry',
            message,
            email,
            name,
            createdAt: new Date().toISOString()
        };
        // In a real implementation, you would:
        // 1. Save to database
        // 2. Send email notification to support team
        // 3. Send confirmation email to user
        res.status(200).json({
            success: true,
            message: 'Contact message sent successfully',
            data: contactData
        });
    }
    catch (error) {
        console.error('Error sending contact message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send contact message',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.sendContactMessage = sendContactMessage;
const getHelpStats = async (req, res) => {
    try {
        // Calculate statistics from mock data
        const totalFAQs = mockFAQs.filter(faq => faq.isActive).length;
        const totalArticles = mockArticles.filter(article => article.isPublished).length;
        const totalTickets = mockTickets.length;
        // Count by categories
        const categoryCounts = {};
        [...mockFAQs, ...mockArticles, ...mockTickets].forEach(item => {
            categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
        });
        res.status(200).json({
            success: true,
            message: 'Help statistics retrieved successfully',
            data: {
                totalFAQs,
                totalArticles,
                totalTickets,
                categoryCounts
            }
        });
    }
    catch (error) {
        console.error('Error fetching help statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch help statistics',
            errors: [getErrorMessage(error)]
        });
    }
};
exports.getHelpStats = getHelpStats;
