/**
 * CATCH ASYNC ERRORS
 * This utility wraps asynchronous Express middleware functions.
 * It automatically catches any rejected promises and forwards them to the global error handler 
 * using the next() function, eliminating the need for repetitive try-catch blocks.
 * 
 * @param {Function} fn - The asynchronous function to be wrapped.
 * @returns {Function} - A standard Express middleware function.
 */
module.exports = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
