"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAccessUserData = exports.adminOnly = exports.authenticateServiceProvider = exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config/config");
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};
exports.authenticate = authenticate;
// Role-based authentication middleware
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const userType = req.user.userType || 'guest';
        if (!allowedRoles.includes(userType)) {
            return res.status(403).json({
                message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
            });
        }
        next();
    };
};
exports.authorize = authorize;
// Service provider authentication (host, tourguide, agent)
const authenticateServiceProvider = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated' });
    }
    const serviceProviderTypes = ['host', 'tourguide', 'agent', 'admin'];
    const userType = req.user.userType || 'guest';
    if (!serviceProviderTypes.includes(userType)) {
        return res.status(403).json({
            message: 'Access denied. Service providers only.'
        });
    }
    next();
};
exports.authenticateServiceProvider = authenticateServiceProvider;
// Admin only middleware
const adminOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated' });
    }
    if (req.user.userType !== 'admin') {
        return res.status(403).json({
            message: 'Access denied. Admin only.'
        });
    }
    next();
};
exports.adminOnly = adminOnly;
// Check if user can access a resource (own data or admin)
const canAccessUserData = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated' });
    }
    const requestedUserId = parseInt(req.params.userId || req.params.id || '0');
    const currentUserId = parseInt(req.user.userId);
    const isAdmin = req.user.userType === 'admin';
    if (requestedUserId && requestedUserId !== currentUserId && !isAdmin) {
        return res.status(403).json({
            message: 'Access denied. You can only access your own data.'
        });
    }
    next();
};
exports.canAccessUserData = canAccessUserData;
