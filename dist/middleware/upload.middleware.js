"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadLogger = exports.uploadCors = exports.handleUploadError = exports.uploadMultiple = exports.uploadSingle = void 0;
// middleware/uploadMiddleware.ts
const multer_1 = __importDefault(require("multer"));
const crypto_1 = require("crypto");
const path_1 = require("path");
const fs_1 = require("fs");
// Generate secure filename
const generateSecureFilename = (originalName) => {
    const timestamp = Date.now();
    const randomHash = (0, crypto_1.randomBytes)(20).toString('hex');
    const fileHash = (0, crypto_1.createHash)('sha256')
        .update(`${originalName}${timestamp}${randomHash}`)
        .digest('hex')
        .substring(0, 40);
    const ext = (0, path_1.extname)(originalName);
    return `${fileHash}${ext}`;
};
// Configure multer storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const category = req.body.category || 'general';
        const uploadDir = './uploads';
        const categoryDir = (0, path_1.join)(uploadDir, category);
        // Ensure upload directory exists
        if (!(0, fs_1.existsSync)(uploadDir)) {
            (0, fs_1.mkdirSync)(uploadDir, { recursive: true });
        }
        // Ensure category directory exists
        if (!(0, fs_1.existsSync)(categoryDir)) {
            (0, fs_1.mkdirSync)(categoryDir, { recursive: true });
        }
        cb(null, categoryDir);
    },
    filename: (req, file, cb) => {
        const secureFilename = generateSecureFilename(file.originalname);
        cb(null, secureFilename);
    }
});
// File filter for security
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/avi', 'video/mov', 'video/webm',
        'audio/mp3', 'audio/wav', 'audio/ogg',
        'application/pdf',
        'text/plain', 'application/json'
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
};
// Configure multer
const upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 10 // Max 10 files for multiple upload
    }
});
// Middleware for single file upload
exports.uploadSingle = upload.single('file');
// Middleware for multiple files upload
exports.uploadMultiple = upload.array('files', 10);
// Error handling middleware for multer errors
const handleUploadError = (error, req, res, next) => {
    if (error instanceof multer_1.default.MulterError) {
        let errorMessage = 'Upload error';
        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                errorMessage = 'File size exceeds 100MB limit';
                break;
            case 'LIMIT_FILE_COUNT':
                errorMessage = 'Too many files. Maximum 10 files allowed';
                break;
            case 'LIMIT_UNEXPECTED_FILE':
                errorMessage = 'Unexpected file field';
                break;
            default:
                errorMessage = `Upload error: ${error.message}`;
        }
        res.status(400).json({
            success: false,
            error: errorMessage
        });
        return;
    }
    if (error) {
        res.status(400).json({
            success: false,
            error: error.message || 'Upload failed'
        });
        return;
    }
    next();
};
exports.handleUploadError = handleUploadError;
// FIXED CORS middleware for upload endpoints
const uploadCors = (req, res, next) => {
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
        // Add your production domains here
    ];
    const origin = req.headers.origin;
    // Check if the origin is allowed
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    // Set other CORS headers
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    next();
};
exports.uploadCors = uploadCors;
// Request logging middleware for uploads
const uploadLogger = (req, res, next) => {
    console.log(`Upload request: ${req.method} ${req.url}`, {
        body: req.body,
        files: req.file ? 1 : (req.files ? req.files.length : 0),
        ip: req.ip,
        origin: req.headers.origin
    });
    next();
};
exports.uploadLogger = uploadLogger;
exports.default = {
    uploadSingle: exports.uploadSingle,
    uploadMultiple: exports.uploadMultiple,
    handleUploadError: exports.handleUploadError,
    uploadCors: exports.uploadCors,
    uploadLogger: exports.uploadLogger
};
