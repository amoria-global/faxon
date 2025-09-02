"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewController = void 0;
const property_service_1 = require("../services/property.service");
class ReviewController {
    constructor() {
        this.propertyService = new property_service_1.PropertyService();
        /**
         * Create a new review for a property
         * POST /api/properties/:propertyId/reviews
         */
        this.createReview = async (req, res) => {
            try {
                // Type assertion for the actual JWT payload structure
                const user = req.user;
                if (!user || !user.userId) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                // Get propertyId from URL params instead of body
                const propertyId = parseInt(req.params.propertyId);
                const reviewData = {
                    propertyId: propertyId, // From URL params
                    rating: req.body.rating,
                    comment: req.body.comment,
                    images: req.body.images
                };
                // Convert string userId to number for the service
                const review = await this.propertyService.createReview(parseInt(user.userId), reviewData);
                res.status(201).json({
                    success: true,
                    message: 'Review created successfully',
                    data: review
                });
            }
            catch (error) {
                console.error('Error creating review:', error);
                if (error.message.includes('can only review properties') ||
                    error.message.includes('already reviewed')) {
                    res.status(403).json({
                        success: false,
                        message: error.message
                    });
                    return;
                }
                if (error.message.includes('not found')) {
                    res.status(404).json({
                        success: false,
                        message: 'Property not found'
                    });
                    return;
                }
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    errors: [error.message]
                });
            }
        };
        /**
         * Get all reviews for a specific property
         * GET /api/reviews/property/:propertyId
         */
        this.getPropertyReviews = async (req, res) => {
            try {
                const propertyId = parseInt(req.params.propertyId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                if (isNaN(propertyId) || propertyId <= 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                const result = await this.propertyService.getPropertyReviews(propertyId, page, limit);
                res.status(200).json({
                    success: true,
                    message: 'Reviews retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error getting property reviews:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    errors: [error.message]
                });
            }
        };
        /**
         * Get all reviews by a specific user
         * GET /api/reviews/user/:userId
         */
        this.getUserReviews = async (req, res) => {
            try {
                const userId = parseInt(req.params.userId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                if (isNaN(userId) || userId <= 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid user ID'
                    });
                    return;
                }
                // Note: This would require implementing getUserReviews in PropertyService
                // For now, returning a placeholder response
                res.status(501).json({
                    success: false,
                    message: 'Get user reviews endpoint not yet implemented'
                });
            }
            catch (error) {
                console.error('Error getting user reviews:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    errors: [error.message]
                });
            }
        };
        /**
         * Update a review (owner only)
         * PUT /api/reviews/:id
         */
        this.updateReview = async (req, res) => {
            try {
                // Type assertion for the actual JWT payload structure
                const user = req.user;
                if (!user || !user.userId) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const reviewId = req.params.id;
                // Note: This would require implementing updateReview in PropertyService
                // For now, returning a placeholder response
                res.status(501).json({
                    success: false,
                    message: 'Update review endpoint not yet implemented'
                });
            }
            catch (error) {
                console.error('Error updating review:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    errors: [error.message]
                });
            }
        };
        /**
         * Delete a review (owner only)
         * DELETE /api/reviews/:id
         */
        this.deleteReview = async (req, res) => {
            try {
                // Type assertion for the actual JWT payload structure
                const user = req.user;
                if (!user || !user.userId) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const reviewId = req.params.id;
                // Note: This would require implementing deleteReview in PropertyService
                // For now, returning a placeholder response
                res.status(501).json({
                    success: false,
                    message: 'Delete review endpoint not yet implemented'
                });
            }
            catch (error) {
                console.error('Error deleting review:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    errors: [error.message]
                });
            }
        };
    }
}
exports.ReviewController = ReviewController;
