import { Request, Response, NextFunction } from 'express';

interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates review creation request
 * Note: propertyId comes from URL params, not body
 */
export const validateReview = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationError[] = [];
  const { rating, comment, images } = req.body;

  // propertyId is already validated by validatePropertyId middleware from URL params

  // Validate rating
  if (rating === undefined || rating === null) {
    errors.push({
      field: 'rating',
      message: 'Rating is required'
    });
  } else if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
    errors.push({
      field: 'rating',
      message: 'Rating must be an integer between 1 and 5'
    });
  }

  // Validate comment
  if (!comment) {
    errors.push({
      field: 'comment',
      message: 'Comment is required'
    });
  } else if (typeof comment !== 'string') {
    errors.push({
      field: 'comment',
      message: 'Comment must be a string'
    });
  } else if (comment.trim().length < 10) {
    errors.push({
      field: 'comment',
      message: 'Comment must be at least 10 characters long'
    });
  } else if (comment.trim().length > 1000) {
    errors.push({
      field: 'comment',
      message: 'Comment cannot exceed 1000 characters'
    });
  }

  // Validate images (optional)
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      errors.push({
        field: 'images',
        message: 'Images must be an array'
      });
    } else if (images.length > 5) {
      errors.push({
        field: 'images',
        message: 'Maximum 5 images allowed per review'
      });
    } else {
      // Validate each image URL
      images.forEach((image: any, index: number) => {
        if (typeof image !== 'string') {
          errors.push({
            field: 'images',
            message: `Image at index ${index} must be a string URL`
          });
        } else if (!isValidUrl(image)) {
          errors.push({
            field: 'images',
            message: `Image at index ${index} must be a valid URL`
          });
        }
      });
    }
  }

  // Return validation errors if any
  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors
    });
    return;
  }

  // Convert rating to number for consistency
  req.body.rating = Number(rating);
  
  // Trim comment whitespace
  req.body.comment = comment.trim();

  next();
};

/**
 * Validates review update request
 */
export const validateReviewUpdate = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationError[] = [];
  const { rating, comment, images } = req.body;

  // Check if at least one field is provided for update
  if (!rating && !comment && !images) {
    errors.push({
      field: 'general',
      message: 'At least one field (rating, comment, or images) must be provided for update'
    });
  }

  // Validate rating if provided
  if (rating !== undefined && rating !== null) {
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
      errors.push({
        field: 'rating',
        message: 'Rating must be an integer between 1 and 5'
      });
    }
  }

  // Validate comment if provided
  if (comment !== undefined) {
    if (comment === null || comment === '') {
      errors.push({
        field: 'comment',
        message: 'Comment cannot be empty'
      });
    } else if (typeof comment !== 'string') {
      errors.push({
        field: 'comment',
        message: 'Comment must be a string'
      });
    } else if (comment.trim().length < 10) {
      errors.push({
        field: 'comment',
        message: 'Comment must be at least 10 characters long'
      });
    } else if (comment.trim().length > 1000) {
      errors.push({
        field: 'comment',
        message: 'Comment cannot exceed 1000 characters'
      });
    }
  }

  // Validate images if provided
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      errors.push({
        field: 'images',
        message: 'Images must be an array'
      });
    } else if (images.length > 5) {
      errors.push({
        field: 'images',
        message: 'Maximum 5 images allowed per review'
      });
    } else {
      // Validate each image URL
      images.forEach((image: any, index: number) => {
        if (typeof image !== 'string') {
          errors.push({
            field: 'images',
            message: `Image at index ${index} must be a string URL`
          });
        } else if (!isValidUrl(image)) {
          errors.push({
            field: 'images',
            message: `Image at index ${index} must be a valid URL`
          });
        }
      });
    }
  }

  // Return validation errors if any
  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors
    });
    return;
  }

  // Convert rating to number if provided
  if (rating !== undefined && rating !== null) {
    req.body.rating = Number(rating);
  }
  
  // Trim comment whitespace if provided
  if (comment !== undefined && comment !== null) {
    req.body.comment = comment.trim();
  }

  next();
};

/**
 * Validates review ID parameter
 */
export const validateReviewId = (req: Request, res: Response, next: NextFunction): void => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({
      success: false,
      message: 'Review ID is required'
    });
    return;
  }

  // Check if it's a valid UUID or number format (adjust based on your ID format)
  if (!/^[0-9a-fA-F-]{36}$/.test(id) && !/^\d+$/.test(id)) {
    res.status(400).json({
      success: false,
      message: 'Invalid review ID format'
    });
    return;
  }

  next();
};

/**
 * Validates property ID parameter
 */
export const validatePropertyId = (req: Request, res: Response, next: NextFunction): void => {
  const { propertyId } = req.params;

  if (!propertyId) {
    res.status(400).json({
      success: false,
      message: 'Property ID is required'
    });
    return;
  }

  if (!Number.isInteger(Number(propertyId)) || Number(propertyId) <= 0) {
    res.status(400).json({
      success: false,
      message: 'Property ID must be a valid positive integer'
    });
    return;
  }

  next();
};

/**
 * Validates user ID parameter
 */
export const validateUserId = (req: Request, res: Response, next: NextFunction): void => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
    return;
  }

  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) {
    res.status(400).json({
      success: false,
      message: 'User ID must be a valid positive integer'
    });
    return;
  }

  next();
};

/**
 * Validates pagination query parameters
 */
export const validatePagination = (req: Request, res: Response, next: NextFunction): void => {
  const { page, limit } = req.query;

  if (page !== undefined) {
    const pageNum = Number(page);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      res.status(400).json({
        success: false,
        message: 'Page must be a positive integer'
      });
      return;
    }
  }

  if (limit !== undefined) {
    const limitNum = Number(limit);
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      res.status(400).json({
        success: false,
        message: 'Limit must be a positive integer between 1 and 100'
      });
      return;
    }
  }

  next();
};

/**
 * Utility function to validate URL format
 */
function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}