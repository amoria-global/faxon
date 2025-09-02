import { Router } from 'express';
import { ReviewController } from '../controllers/review.controller';
// Update the import based on your actual auth middleware export
import { authenticate } from '../middleware/auth.middleware';
import {
  validateReview,
  validateReviewUpdate,
  validateReviewId,
  validatePropertyId,
  validateUserId,
  validatePagination
} from '../middleware/review.validation';

const router = Router();
const reviewController = new ReviewController();

/**
 * @route   POST /api/properties/:propertyId/reviews
 * @desc    Create a new review for a property
 * @access  Private (Authenticated users only)
 * @params  propertyId (number) - ID of the property to review
 * @body    { rating: number, comment: string, images?: string[] }
 */
router.post(
  '/properties/:propertyId/reviews',
  authenticate,
  validatePropertyId,
  validateReview,
  reviewController.createReview
);

/**
 * @route   GET /api/properties/:propertyId/reviews
 * @desc    Get all reviews for a specific property
 * @access  Public
 * @params  propertyId (number) - ID of the property
 * @query   page (number, optional) - Page number (default: 1)
 *          limit (number, optional) - Items per page (default: 10, max: 100)
 */
router.get(
  '/properties/:propertyId/reviews',
  validatePropertyId,
  validatePagination,
  reviewController.getPropertyReviews
);

/**
 * @route   GET /api/reviews/user/:userId  
 * @desc    Get all reviews written by a specific user
 * @access  Public
 * @params  userId (number) - ID of the user
 * @query   page (number, optional) - Page number (default: 1)
 *          limit (number, optional) - Items per page (default: 10, max: 100)
 */
router.get(
  '/reviews/user/:userId',
  validateUserId,
  validatePagination,
  reviewController.getUserReviews
);

/**
 * @route   PUT /api/reviews/:id
 * @desc    Update an existing review (owner only)
 * @access  Private (Authenticated users only - review owner)
 * @params  id (string) - ID of the review to update
 * @body    { rating?: number, comment?: string, images?: string[] }
 */
router.put(
  '/reviews/:id',
  authenticate,
  validateReviewId,
  validateReviewUpdate,
  reviewController.updateReview
);

/**
 * @route   DELETE /api/reviews/:id
 * @desc    Delete an existing review (owner only)
 * @access  Private (Authenticated users only - review owner)
 * @params  id (string) - ID of the review to delete
 */
router.delete(
  '/reviews/:id',
  authenticate,
  validateReviewId,
  reviewController.deleteReview
);

export default router;