const express = require("express");
const tourRouter = require("./routes/tourRoutes.js");
const userRouter = require("./routes/userRoutes.js");
const reviewRouter = require("./routes/reviewRoutes.js");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");

const app = express();

/**
 * ------------------------------------------------------------------
 * 1) GLOBAL CONFIGURATION & MIDDLEWARES
 * ------------------------------------------------------------------
 */

// Set query parser to 'extended' to handle nested objects in URL query strings.
app.set("query parser", "extended");

// SECURITY HEADERS: Set various HTTP headers to protect the app.
app.use(helmet());

// LOGGING: Development logging using Morgan.
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// RATE LIMITING: Prevent Denial of Service (DoS) by limiting requests from the same IP.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Max 100 requests per IP
  message: "Too many requests from this IP, please try again in 15 minutes!",
});
app.use("/api", limiter);

// BODY PARSER: Read JSON data from request body into req.body (Max 10kb limit for security).
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

/**
 * ------------------------------------------------------------------
 * 2) CUSTOM SECURITY & DATA CLEANING (HPP protection)
 * ------------------------------------------------------------------
 * NOTE: In the MongoDB version this block also defended against NoSQL
 * injection ($ operators). PostgreSQL + Prisma render that unnecessary:
 * Prisma ALWAYS parameterizes queries (prepared statements), so no SQL
 * injection is possible from req.query/req.body. We keep the HPP
 * protection because duplicate query keys would otherwise reach Prisma
 * as arrays and confuse the where-clause builder.
 */
app.use((req, res, next) => {
  // A) HTTP PARAMETER POLLUTION (HPP) PROTECTION
  // E.g., /api/tours?price=500&price=600 results in an array [500, 600].
  // This can break DB queries. We clean it by keeping only the last value (600).
  if (req.query) {
    const cleanQuery = {};
    let isPolluted = false;

    for (const key in req.query) {
      if (Array.isArray(req.query[key])) {
        cleanQuery[key] = req.query[key][req.query[key].length - 1];
        isPolluted = true;
      } else {
        cleanQuery[key] = req.query[key];
      }
    }

    if (isPolluted) {
      Object.defineProperty(req, "query", {
        value: cleanQuery,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }

  // B) BODY DATA CLEANING
  // We also clean duplicate parameters in the request body for POST/PATCH requests.
  // IMPORTANT: We use a 'whitelist' to preserve fields that are EXPECTED to be arrays.
  if (req.body && typeof req.body === "object") {
    const whitelist = ["images", "startDates", "guides"];
    for (const key in req.body) {
      if (Array.isArray(req.body[key]) && !whitelist.includes(key)) {
        req.body[key] = req.body[key][req.body[key].length - 1];
      }
    }
  }

  // ALWAYS call next() to move to the next middleware in the stack.
  next();
});

/**
 * ------------------------------------------------------------------
 * 3) ROUTES
 * ------------------------------------------------------------------
 */
app.use("/api/tours", tourRouter);
app.use("/api/users", userRouter);
app.use("/api/reviews", reviewRouter);

/**
 * ------------------------------------------------------------------
 * 4) ERROR HANDLING
 * ------------------------------------------------------------------
 */
const AppError = require("./utils/error.js");
const globalErrorHandler = require("./controllers/errorController.js");

// Fallback: Catch all undefined routes and return a 404 error.
app.all(/(.*)/, (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler: Centralized error processing for the entire application.
app.use(globalErrorHandler);

module.exports = app;
