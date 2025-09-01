"use strict";
// src/utils/errors.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAsyncError = exports.formatErrorResponse = exports.logError = exports.isRateLimitError = exports.isNotFoundError = exports.isAuthorizationError = exports.isAuthenticationError = exports.isValidationError = exports.isOperationalError = exports.isAppError = exports.createNotFoundError = exports.createDuplicateError = exports.createValidationError = exports.ConnectionError = exports.TimeoutError = exports.NetworkError = exports.FileTypeError = exports.FileSizeError = exports.FileUploadError = exports.MissingTokenError = exports.InvalidTokenError = exports.ExpiredTokenError = exports.TokenError = exports.InvalidSessionError = exports.ExpiredSessionError = exports.SessionError = exports.InvalidEmailError = exports.EmailDeliveryError = exports.EmailError = exports.DatabaseConstraintError = exports.DatabaseConnectionError = exports.DatabaseError = exports.AppleOAuthError = exports.GoogleOAuthError = exports.OAuthError = exports.ServiceUnavailableError = exports.InternalServerError = exports.RateLimitError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode = 500, details, isOperational = true) {
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
exports.AppError = AppError;
// Predefined error classes for common scenarios
class ValidationError extends AppError {
    constructor(message = 'Validation failed', details) {
        super(message, 400, details);
    }
}
exports.ValidationError = ValidationError;
class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401);
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403);
    }
}
exports.AuthorizationError = AuthorizationError;
class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message = 'Resource already exists') {
        super(message, 409);
    }
}
exports.ConflictError = ConflictError;
class RateLimitError extends AppError {
    constructor(message = 'Rate limit exceeded', retryAfter) {
        super(message, 429, { retryAfter });
    }
}
exports.RateLimitError = RateLimitError;
class InternalServerError extends AppError {
    constructor(message = 'Internal server error') {
        super(message, 500);
    }
}
exports.InternalServerError = InternalServerError;
class ServiceUnavailableError extends AppError {
    constructor(message = 'Service temporarily unavailable') {
        super(message, 503);
    }
}
exports.ServiceUnavailableError = ServiceUnavailableError;
// OAuth specific errors
class OAuthError extends AppError {
    constructor(message, provider, statusCode = 400) {
        super(message, statusCode);
        this.provider = provider;
    }
}
exports.OAuthError = OAuthError;
class GoogleOAuthError extends OAuthError {
    constructor(message = 'Google authentication failed') {
        super(message, 'google');
    }
}
exports.GoogleOAuthError = GoogleOAuthError;
class AppleOAuthError extends OAuthError {
    constructor(message = 'Apple authentication failed') {
        super(message, 'apple');
    }
}
exports.AppleOAuthError = AppleOAuthError;
// Database specific errors
class DatabaseError extends AppError {
    constructor(message = 'Database operation failed', details) {
        super(message, 500, details);
    }
}
exports.DatabaseError = DatabaseError;
class DatabaseConnectionError extends DatabaseError {
    constructor(message = 'Database connection failed') {
        super(message);
    }
}
exports.DatabaseConnectionError = DatabaseConnectionError;
class DatabaseConstraintError extends DatabaseError {
    constructor(message = 'Database constraint violation', details) {
        super(message, 409, details);
    }
}
exports.DatabaseConstraintError = DatabaseConstraintError;
// Email specific errors
class EmailError extends AppError {
    constructor(message = 'Email operation failed', statusCode = 500) {
        super(message, statusCode);
    }
}
exports.EmailError = EmailError;
class EmailDeliveryError extends EmailError {
    constructor(message = 'Failed to send email') {
        super(message, 500);
    }
}
exports.EmailDeliveryError = EmailDeliveryError;
class InvalidEmailError extends EmailError {
    constructor(message = 'Invalid email address') {
        super(message, 400);
    }
}
exports.InvalidEmailError = InvalidEmailError;
// Session specific errors
class SessionError extends AppError {
    constructor(message = 'Session error', statusCode = 401) {
        super(message, statusCode);
    }
}
exports.SessionError = SessionError;
class ExpiredSessionError extends SessionError {
    constructor(message = 'Session expired') {
        super(message, 401);
    }
}
exports.ExpiredSessionError = ExpiredSessionError;
class InvalidSessionError extends SessionError {
    constructor(message = 'Invalid session') {
        super(message, 401);
    }
}
exports.InvalidSessionError = InvalidSessionError;
// Token specific errors
class TokenError extends AppError {
    constructor(message = 'Token error', statusCode = 401) {
        super(message, statusCode);
    }
}
exports.TokenError = TokenError;
class ExpiredTokenError extends TokenError {
    constructor(message = 'Token expired') {
        super(message, 401);
    }
}
exports.ExpiredTokenError = ExpiredTokenError;
class InvalidTokenError extends TokenError {
    constructor(message = 'Invalid token') {
        super(message, 401);
    }
}
exports.InvalidTokenError = InvalidTokenError;
class MissingTokenError extends TokenError {
    constructor(message = 'Token required') {
        super(message, 401);
    }
}
exports.MissingTokenError = MissingTokenError;
// File upload errors
class FileUploadError extends AppError {
    constructor(message = 'File upload failed', statusCode = 400) {
        super(message, statusCode);
    }
}
exports.FileUploadError = FileUploadError;
class FileSizeError extends FileUploadError {
    constructor(message = 'File too large') {
        super(message, 413);
    }
}
exports.FileSizeError = FileSizeError;
class FileTypeError extends FileUploadError {
    constructor(message = 'Invalid file type') {
        super(message, 415);
    }
}
exports.FileTypeError = FileTypeError;
// Network errors
class NetworkError extends AppError {
    constructor(message = 'Network error', statusCode = 500) {
        super(message, statusCode);
    }
}
exports.NetworkError = NetworkError;
class TimeoutError extends NetworkError {
    constructor(message = 'Request timeout') {
        super(message, 408);
    }
}
exports.TimeoutError = TimeoutError;
class ConnectionError extends NetworkError {
    constructor(message = 'Connection failed') {
        super(message, 503);
    }
}
exports.ConnectionError = ConnectionError;
// Error factory functions
const createValidationError = (field, value, constraint) => {
    const message = constraint
        ? `Validation failed for field '${field}': ${constraint}`
        : `Invalid value for field '${field}'`;
    return new ValidationError(message, {
        field,
        value,
        constraint,
    });
};
exports.createValidationError = createValidationError;
const createDuplicateError = (field, value) => {
    return new ConflictError(`${field} '${value}' already exists`, {
        field,
        value,
    });
};
exports.createDuplicateError = createDuplicateError;
const createNotFoundError = (resource, identifier) => {
    const message = identifier
        ? `${resource} with identifier '${identifier}' not found`
        : `${resource} not found`;
    return new NotFoundError(message, {
        resource,
        identifier,
    });
};
exports.createNotFoundError = createNotFoundError;
// Error type guards
const isAppError = (error) => {
    return error instanceof AppError;
};
exports.isAppError = isAppError;
const isOperationalError = (error) => {
    return (0, exports.isAppError)(error) && error.isOperational;
};
exports.isOperationalError = isOperationalError;
const isValidationError = (error) => {
    return error instanceof ValidationError;
};
exports.isValidationError = isValidationError;
const isAuthenticationError = (error) => {
    return error instanceof AuthenticationError;
};
exports.isAuthenticationError = isAuthenticationError;
const isAuthorizationError = (error) => {
    return error instanceof AuthorizationError;
};
exports.isAuthorizationError = isAuthorizationError;
const isNotFoundError = (error) => {
    return error instanceof NotFoundError;
};
exports.isNotFoundError = isNotFoundError;
const isRateLimitError = (error) => {
    return error instanceof RateLimitError;
};
exports.isRateLimitError = isRateLimitError;
// Error logging utilities
const logError = (error, context) => {
    const errorLog = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        ...((0, exports.isAppError)(error) && {
            statusCode: error.statusCode,
            details: error.details,
            isOperational: error.isOperational,
        }),
        ...(context && { context }),
    };
    if (process.env.NODE_ENV === 'production') {
        console.error(JSON.stringify(errorLog));
    }
    else {
        console.error('ERROR:', errorLog);
    }
};
exports.logError = logError;
// Error response formatter
const formatErrorResponse = (error) => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    if ((0, exports.isAppError)(error)) {
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
exports.formatErrorResponse = formatErrorResponse;
// Global error handler helper
const handleAsyncError = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.handleAsyncError = handleAsyncError;
