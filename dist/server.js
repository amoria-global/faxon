"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config/config");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const property_routes_1 = __importDefault(require("./routes/property.routes"));
const booking_routes_1 = __importDefault(require("./routes/booking.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const withdrawal_routes_1 = __importDefault(require("./routes/withdrawal.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const help_routes_1 = __importDefault(require("./routes/help.routes"));
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
const sms_test_routes_1 = __importDefault(require("./routes/sms.test.routes")); // Add this import
const email_test_routes_1 = __importDefault(require("./routes/email.test.routes"));
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://jambolush.com',
        'https://app.jambolush.com',
        'http://jambolush.com',
        'http://app.jambolush.com',
        'https://www.jambolush.com',
        'https://www.app.jambolush.com',
    ],
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Request logger middleware
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`➡️  [${req.method}] ${req.originalUrl}`);
    console.log('Headers:', req.headers);
    if (Object.keys(req.body || {}).length) {
        console.log('Body:', req.body);
    }
    // Capture the original send method
    const oldSend = res.send;
    res.send = function (data) {
        const duration = Date.now() - start;
        console.log(`⬅️  Response to [${req.method}] ${req.originalUrl} (${duration}ms)`);
        try {
            console.log('Status:', res.statusCode);
            console.log('Response:', JSON.parse(data));
        }
        catch {
            console.log('Response:', data);
        }
        // @ts-ignore
        return oldSend.apply(res, arguments);
    };
    next();
});
// Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/payments', require('./routes/escrow.routes').default);
app.use('/api/payments/withdrawal', withdrawal_routes_1.default);
app.use('/api/properties', property_routes_1.default);
app.use('/api/upload', upload_routes_1.default);
app.use('/api/bookings', booking_routes_1.default);
app.use('/api/tours', require('./routes/tours.routes').default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/help', help_routes_1.default);
app.use('/api/settings', settings_routes_1.default);
app.use('/api/pesapal', require('./routes/pesapal.callback').default);
app.use('/api/sms', sms_test_routes_1.default); // Add SMS test routes
app.use('/api/sms', sms_test_routes_1.default); // Add SMS test routes
app.use('/api/brevo/email', email_test_routes_1.default); // Email test routes
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Error stack:', err.stack);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error'
    });
});
app.listen(config_1.config.port, () => {
    console.log(`🚀 Server running on port ${config_1.config.port}`);
});
exports.default = app;
