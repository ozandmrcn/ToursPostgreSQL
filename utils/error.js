/**
 * CUSTOM APPLICATION ERROR CLASS
 * Extends the built-in Error class to handle operational errors.
 * Operational errors are predictable errors (e.g., validation failed, record not found)
 * as opposed to programming bugs or system failures.
 */
class AppError extends Error {
  /**
   * @param {string} message - The error message.
   * @param {number} statusCode - HTTP status code (e.g., 404, 400).
   */
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    // status is 'fail' for 4xx errors and 'error' for 5xx errors
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    
    // Flag to identify operational errors in the global error handler
    this.isOperational = true;

    // Captures the stack trace to maintain visibility on where the error originated
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
