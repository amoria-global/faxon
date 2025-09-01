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
const property_routes_1 = __importDefault(require("./routes/property.routes")); // ADDED: Import property routes consistently
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({
    origin: config_1.config.clientUrl,
    credentials: true
}));
app.use(express_1.default.json());
// Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/payments', payment_routes_1.default);
app.use('/api/properties', property_routes_1.default); // UPDATED: Use the imported property routes
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error'
    });
});
app.listen(config_1.config.port, () => {
    console.log(`Server running on port ${config_1.config.port}`);
});
