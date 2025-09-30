"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// services/uploadService.ts
const crypto_1 = require("crypto");
const path_1 = require("path");
const fs_1 = require("fs");
class UploadService {
    constructor() {
        this.UPLOAD_DIR = './uploads';
        this.MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
        this.ALLOWED_MIME_TYPES = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/avi', 'video/mov', 'video/webm',
            'audio/mp3', 'audio/wav', 'audio/ogg',
            'application/pdf',
            'text/plain', 'application/json'
        ];
        this.ensureUploadDirectory();
    }
    ensureUploadDirectory() {
        if (!(0, fs_1.existsSync)(this.UPLOAD_DIR)) {
            (0, fs_1.mkdirSync)(this.UPLOAD_DIR, { recursive: true });
        }
    }
    generateSecureFilename(originalName) {
        const timestamp = Date.now();
        const randomHash = (0, crypto_1.randomBytes)(20).toString('hex');
        const fileHash = (0, crypto_1.createHash)('sha256')
            .update(`${originalName}${timestamp}${randomHash}`)
            .digest('hex')
            .substring(0, 40);
        const ext = (0, path_1.extname)(originalName);
        return `${fileHash}${ext}`;
    }
    ensureCategoryDirectory(category) {
        const categoryDir = (0, path_1.join)(this.UPLOAD_DIR, category);
        if (!(0, fs_1.existsSync)(categoryDir)) {
            (0, fs_1.mkdirSync)(categoryDir, { recursive: true });
        }
        return categoryDir;
    }
    generateSecureUrl(baseUrl, category, filename) {
        return `${baseUrl}/uploads/${category}/${filename}`;
    }
    validateFile(file) {
        // Check file size
        if (file.size > this.MAX_FILE_SIZE) {
            return { isValid: false, error: 'File size exceeds 100MB limit' };
        }
        // Check mime type
        if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return { isValid: false, error: `File type ${file.mimetype} not allowed` };
        }
        return { isValid: true };
    }
    async uploadSingle(file, category = 'general', baseUrl) {
        try {
            // Validate file
            const validation = this.validateFile(file);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: validation.error
                };
            }
            const secureUrl = this.generateSecureUrl(baseUrl, category, file.filename);
            return {
                success: true,
                data: {
                    url: secureUrl,
                    filename: file.filename,
                    originalName: file.originalname,
                    size: file.size,
                    mimeType: file.mimetype,
                    category,
                    uploadTime: new Date().toISOString()
                }
            };
        }
        catch (error) {
            console.error('Upload service error:', error);
            return {
                success: false,
                error: 'Upload processing failed'
            };
        }
    }
    async uploadMultiple(files, category = 'general', baseUrl) {
        try {
            if (!files || files.length === 0) {
                return {
                    success: false,
                    error: 'No files provided'
                };
            }
            // Validate all files
            for (const file of files) {
                const validation = this.validateFile(file);
                if (!validation.isValid) {
                    return {
                        success: false,
                        error: `File ${file.originalname}: ${validation.error}`
                    };
                }
            }
            const uploadedFiles = files.map(file => ({
                url: this.generateSecureUrl(baseUrl, category, file.filename),
                filename: file.filename,
                originalName: file.originalname,
                size: file.size,
                mimeType: file.mimetype
            }));
            return {
                success: true,
                data: {
                    files: uploadedFiles,
                    count: uploadedFiles.length,
                    category,
                    uploadTime: new Date().toISOString()
                }
            };
        }
        catch (error) {
            console.error('Multiple upload service error:', error);
            return {
                success: false,
                error: 'Multiple upload processing failed'
            };
        }
    }
    getUploadInfo() {
        return {
            maxFileSize: '100MB',
            allowedTypes: this.ALLOWED_MIME_TYPES,
            uploadEndpoints: {
                single: '/api/upload',
                multiple: '/api/upload/multiple'
            }
        };
    }
}
exports.default = new UploadService();
