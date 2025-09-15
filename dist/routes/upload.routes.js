"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRoutes = void 0;
// routes/uploadRoutes.ts
const express_1 = require("express");
const upload_controller_1 = __importDefault(require("../controllers/upload.controller"));
const upload_middleware_1 = require("../middleware/upload.middleware");
const router = (0, express_1.Router)();
exports.uploadRoutes = router;
// Apply CORS to all upload routes
router.use(upload_middleware_1.uploadCors);
// Apply logging to all upload routes
router.use(upload_middleware_1.uploadLogger);
// Single file upload route
router.post('/single', upload_middleware_1.handleUploadError, upload_controller_1.default.uploadSingle);
// Multiple files upload route
router.post('/multiple', upload_middleware_1.handleUploadError, upload_controller_1.default.uploadMultiple);
// Get upload configuration info
router.get('/info', upload_controller_1.default.getUploadInfo);
// Serve uploaded files
router.get('/:category/:filename', upload_controller_1.default.serveFile);
exports.default = router;
