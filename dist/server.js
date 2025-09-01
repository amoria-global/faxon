"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//src/server.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("./config/config");
// Import all route modules
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const property_routes_1 = __importDefault(require("./routes/property.routes"));
const booking_routes_1 = __importDefault(require("./routes/booking.routes"));
const app = (0, express_1.default)();
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
// CORS configuration
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        const allowedOrigins = [
            config_1.config.clientUrl,
            'http://localhost:3000',
            'http://localhost:3001',
            'https://your-production-domain.com'
        ];
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
// Stricter rate limiting for auth endpoints
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 auth requests per windowMs
    message: {
        error: 'Too many authentication attempts from this IP, please try again later.'
    },
});
// Apply rate limiting
app.use('/api/', limiter);
app.use('/api/auth', authLimiter);
// Body parsing middleware
app.use(express_1.default.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf.toString());
        }
        catch (e) {
            throw new Error('Invalid JSON');
        }
    }
}));
app.use(express_1.default.urlencoded({
    extended: true,
    limit: '10mb'
}));
// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});
// Health check endpoint (before other routes)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});
// Root endpoint - Welcome message
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to JamboLush API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            api: '/api',
            auth: '/api/auth',
            properties: '/api/properties',
            bookings: '/api/bookings',
            payments: '/api/payments'
        },
        documentation: '/api/docs',
        timestamp: new Date().toISOString()
    });
});
// API routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/payments', payment_routes_1.default);
app.use('/api/properties', property_routes_1.default);
app.use('/api/bookings', booking_routes_1.default);
// API version endpoint
app.get('/api', (req, res) => {
    res.json({
        message: 'JamboLush API v1.0.0',
        endpoints: {
            auth: '/api/auth',
            properties: '/api/properties',
            bookings: '/api/bookings',
            payments: '/api/payments'
        },
        documentation: '/api/docs'
    });
});
app.get('/api/bookings/test', (req, res) => {
    res.json({ success: true, message: 'Booking routes path works!' });
});
// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.path,
        method: req.method
    });
});
// Global error handler
app.use((err, req, res, next) => {
    console.error('Error occurred:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });
    // Handle different types of errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: err.errors || [err.message]
        });
    }
    if (err.name === 'UnauthorizedError' || err.status === 401) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access',
            code: 'UNAUTHORIZED'
        });
    }
    if (err.name === 'ForbiddenError' || err.status === 403) {
        return res.status(403).json({
            success: false,
            message: 'Forbidden access',
            code: 'FORBIDDEN'
        });
    }
    if (err.status === 404) {
        return res.status(404).json({
            success: false,
            message: 'Resource not found'
        });
    }
    if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON format'
        });
    }
    // Handle Prisma errors
    if (err.code === 'P2002') {
        return res.status(409).json({
            success: false,
            message: 'Resource already exists',
            code: 'DUPLICATE_ENTRY'
        });
    }
    if (err.code === 'P2025') {
        return res.status(404).json({
            success: false,
            message: 'Record not found',
            code: 'NOT_FOUND'
        });
    }
    // Default error response
    const statusCode = err.status || err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error';
    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV !== 'production' && {
            stack: err.stack,
            details: err
        })
    });
});
// Graceful shutdown handling
const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    // Close server
    server.close((err) => {
        if (err) {
            console.error('Error during server shutdown:', err);
            process.exit(1);
        }
        console.log('Server closed successfully');
        // Close database connections, cleanup resources, etc.
        // Add your cleanup logic here
        process.exit(0);
    });
    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
};
// Start server
const PORT = config_1.config.port || 5000;
const server = app.listen(PORT, () => {
    console.log(`
🚀 JamboLush Server is running!
📡 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Health Check: http://localhost:${PORT}/health
📚 API: http://localhost:${PORT}/api
⏰ Started at: ${new Date().toISOString()}
  `);
});
// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
exports.default = app;
