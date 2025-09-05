"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config/config");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const property_routes_1 = __importDefault(require("./routes/property.routes"));
const booking_routes_1 = __importDefault(require("./routes/booking.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://jambolush.com'
    ],
    credentials: true
}));
app.use(express_1.default.json());
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
app.use('/api/payments', payment_routes_1.default);
app.use('/api/properties', property_routes_1.default);
app.use('/api/upload', upload_routes_1.default);
app.use('/api/bookings', booking_routes_1.default);
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
