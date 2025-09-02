"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const review_controller_1 = require("../controllers/review.controller");
// Update the import based on your actual auth middleware export
const auth_middleware_1 = require("../middleware/auth.middleware");
const review_validation_1 = require("../middleware/review.validation");
const router = (0, express_1.Router)();
const reviewController = new review_controller_1.ReviewController();
/**
 * @route   POST /api/properties/:propertyId/reviews
 * @desc    Create a new review for a property
 * @access  Private (Authenticated users only)
 * @params  propertyId (number) - ID of the property to review
 * @body    { rating: number, comment: string, images?: string[] }
 */
router.post('/properties/:propertyId/reviews', auth_middleware_1.authenticate, review_validation_1.validatePropertyId, review_validation_1.validateReview, reviewController.createReview);
/**
 * @route   GET /api/properties/:propertyId/reviews
 * @desc    Get all reviews for a specific property
 * @access  Public
 * @params  propertyId (number) - ID of the property
 * @query   page (number, optional) - Page number (default: 1)
 *          limit (number, optional) - Items per page (default: 10, max: 100)
 */
router.get('/properties/:propertyId/reviews', review_validation_1.validatePropertyId, review_validation_1.validatePagination, reviewController.getPropertyReviews);
/**
 * @route   GET /api/reviews/user/:userId
 * @desc    Get all reviews written by a specific user
 * @access  Public
 * @params  userId (number) - ID of the user
 * @query   page (number, optional) - Page number (default: 1)
 *          limit (number, optional) - Items per page (default: 10, max: 100)
 */
router.get('/reviews/user/:userId', review_validation_1.validateUserId, review_validation_1.validatePagination, reviewController.getUserReviews);
/**
 * @route   PUT /api/reviews/:id
 * @desc    Update an existing review (owner only)
 * @access  Private (Authenticated users only - review owner)
 * @params  id (string) - ID of the review to update
 * @body    { rating?: number, comment?: string, images?: string[] }
 */
router.put('/reviews/:id', auth_middleware_1.authenticate, review_validation_1.validateReviewId, review_validation_1.validateReviewUpdate, reviewController.updateReview);
/**
 * @route   DELETE /api/reviews/:id
 * @desc    Delete an existing review (owner only)
 * @access  Private (Authenticated users only - review owner)
 * @params  id (string) - ID of the review to delete
 */
router.delete('/reviews/:id', auth_middleware_1.authenticate, review_validation_1.validateReviewId, reviewController.deleteReview);
exports.default = router;
