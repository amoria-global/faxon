// src/utils/errors.ts

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor); 
    }

    this.name = this.constructor.name;
  }
}

// Predefined error classes for common scenarios
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429, { retryAfter });
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503);
  }
}

// OAuth specific errors
export class OAuthError extends AppError {
  public readonly provider: string;

  constructor(message: string, provider: string, statusCode: number = 400) {
    super(message, statusCode);
    this.provider = provider;
  }
}

export class GoogleOAuthError extends OAuthError {
  constructor(message: string = 'Google authentication failed') {
    super(message, 'google');
  }
}

export class AppleOAuthError extends OAuthError {
  constructor(message: string = 'Apple authentication failed') {
    super(message, 'apple');
  }
}

// Database specific errors
export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed', details?: any) {
    super(message, 500, details);
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(message: string = 'Database connection failed') {
    super(message);
  }
}

export class DatabaseConstraintError extends DatabaseError {
  constructor(message: string = 'Database constraint violation', details?: any) {
    super(message, 409, details);
  }
}

// Email specific errors
export class EmailError extends AppError {
  constructor(message: string = 'Email operation failed', statusCode: number = 500) {
    super(message, statusCode);
  }
}

export class EmailDeliveryError extends EmailError {
  constructor(message: string = 'Failed to send email') {
    super(message, 500);
  }
}

export class InvalidEmailError extends EmailError {
  constructor(message: string = 'Invalid email address') {
    super(message, 400);
  }
}

// Session specific errors
export class SessionError extends AppError {
  constructor(message: string = 'Session error', statusCode: number = 401) {
    super(message, statusCode);
  }
}

export class ExpiredSessionError extends SessionError {
  constructor(message: string = 'Session expired') {
    super(message, 401);
  }
}

export class InvalidSessionError extends SessionError {
  constructor(message: string = 'Invalid session') {
    super(message, 401);
  }
}

// Token specific errors
export class TokenError extends AppError {
  constructor(message: string = 'Token error', statusCode: number = 401) {
    super(message, statusCode);
  }
}

export class ExpiredTokenError extends TokenError {
  constructor(message: string = 'Token expired') {
    super(message, 401);
  }
}

export class InvalidTokenError extends TokenError {
  constructor(message: string = 'Invalid token') {
    super(message, 401);
  }
}

export class MissingTokenError extends TokenError {
  constructor(message: string = 'Token required') {
    super(message, 401);
  }
}

// File upload errors
export class FileUploadError extends AppError {
  constructor(message: string = 'File upload failed', statusCode: number = 400) {
    super(message, statusCode);
  }
}

export class FileSizeError extends FileUploadError {
  constructor(message: string = 'File too large') {
    super(message, 413);
  }
}

export class FileTypeError extends FileUploadError {
  constructor(message: string = 'Invalid file type') {
    super(message, 415);
  }
}

// Network errors
export class NetworkError extends AppError {
  constructor(message: string = 'Network error', statusCode: number = 500) {
    super(message, statusCode);
  }
}

export class TimeoutError extends NetworkError {
  constructor(message: string = 'Request timeout') {
    super(message, 408);
  }
}

export class ConnectionError extends NetworkError {
  constructor(message: string = 'Connection failed') {
    super(message, 503);
  }
}

// Error factory functions
export const createValidationError = (field: string, value?: any, constraint?: string): ValidationError => {
  const message = constraint 
    ? `Validation failed for field '${field}': ${constraint}`
    : `Invalid value for field '${field}'`;
  
  return new ValidationError(message, {
    field,
    value,
    constraint,
  });
};

export const createDuplicateError = (field: string, value: any): ConflictError => {
  return new ConflictError(`${field} '${value}' already exists`, {
    field,
    value,
  });
};

export const createNotFoundError = (resource: string, identifier?: string): NotFoundError => {
  const message = identifier 
    ? `${resource} with identifier '${identifier}' not found`
    : `${resource} not found`;
  
  return new NotFoundError(message, {
    resource,
    identifier,
  });
};

// Error type guards
export const isAppError = (error: unknown): error is AppError => {
  return error instanceof AppError;
};

export const isOperationalError = (error: unknown): boolean => {
  return isAppError(error) && error.isOperational;
};

export const isValidationError = (error: unknown): error is ValidationError => {
  return error instanceof ValidationError;
};

export const isAuthenticationError = (error: unknown): error is AuthenticationError => {
  return error instanceof AuthenticationError;
};

export const isAuthorizationError = (error: unknown): error is AuthorizationError => {
  return error instanceof AuthorizationError;
};

export const isNotFoundError = (error: unknown): error is NotFoundError => {
  return error instanceof NotFoundError;
};

export const isRateLimitError = (error: unknown): error is RateLimitError => {
  return error instanceof RateLimitError;
};

// Error logging utilities
export const logError = (error: Error, context?: Record<string, any>): void => {
  const errorLog = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    ...(isAppError(error) && {
      statusCode: error.statusCode,
      details: error.details,
      isOperational: error.isOperational,
    }),
    ...(context && { context }),
  };

  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify(errorLog));
  } else {
    console.error('ERROR:', errorLog);
  }
};

// Error response formatter
export const formatErrorResponse = (error: Error) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isAppError(error)) {
    return {
      success: false,
      error: {
        message: error.message,
        statusCode: error.statusCode,
        ...(error.details && { details: error.details }),
        ...(isDevelopment && { stack: error.stack }),
      },
    };
  }

  return {
    success: false,
    error: {
      message: 'Internal server error',
      statusCode: 500,
      ...(isDevelopment && { 
        originalMessage: error.message,
        stack: error.stack 
      }),
    },
  };
};

// Global error handler helper
export const handleAsyncError = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};