"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const upload_service_1 = __importDefault(require("../services/upload.service"));
class UploadController {
    async uploadSingle(req, res) {
        try {
            console.log('Single file upload request received');
            if (!req.file) {
                res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
                return;
            }
            const category = req.body.category || 'general';
            const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
            const result = await upload_service_1.default.uploadSingle(req.file, category, baseUrl);
            if (result.success) {
                console.log('File uploaded successfully:', result.data?.url);
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Upload controller error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async uploadMultiple(req, res) {
        try {
            console.log('Multiple files upload request received');
            if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'No files uploaded'
                });
                return;
            }
            const category = req.body.category || 'general';
            const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
            const result = await upload_service_1.default.uploadMultiple(req.files, category, baseUrl);
            if (result.success) {
                console.log(`${result.data?.count} files uploaded successfully`);
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Multiple upload controller error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async getUploadInfo(req, res) {
        try {
            const info = upload_service_1.default.getUploadInfo();
            res.status(200).json({
                success: true,
                data: info
            });
        }
        catch (error) {
            console.error('Upload info error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get upload info'
            });
        }
    }
    async serveFile(req, res) {
        try {
            const { category, filename } = req.params;
            // Security validation
            if (!/^[a-zA-Z0-9._-]+$/.test(filename) ||
                !/^[a-zA-Z0-9_-]+$/.test(category)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid file path'
                });
                return;
            }
            const filePath = `./uploads/${category}/${filename}`;
            // Set appropriate headers
            const ext = filename.split('.').pop()?.toLowerCase();
            const mimeTypes = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'mp4': 'video/mp4',
                'webm': 'video/webm',
                'pdf': 'application/pdf'
            };
            if (ext && mimeTypes[ext]) {
                res.setHeader('Content-Type', mimeTypes[ext]);
            }
            // Cache headers
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            res.sendFile(filePath, { root: '.' }, (err) => {
                if (err) {
                    console.error('File serve error:', err);
                    res.status(404).json({
                        success: false,
                        error: 'File not found'
                    });
                }
            });
        }
        catch (error) {
            console.error('File serve error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    }
}
exports.default = new UploadController();
