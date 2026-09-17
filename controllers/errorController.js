// ===================================================================
//  @file controllers/errorController.js
//  @description Global error handler with Prisma error-code mapping.
//
//  MongoDB era: this file mapped Mongoose CastError / ValidationError /
//  duplicate-11000 errors to friendly messages.
//  Prisma era: PostgreSQL surfaces problems as Prisma exception codes
//  that follow the P#### convention (see handlePrismaError below).
//  Whatever passes through here is turned into a clean JSON response
//  and every unexpected 500 keeps the DB error surface minimal.
// ===================================================================

const AppError = require("../utils/error.js");

/**
 * Translate Prisma error codes into user-friendly AppErrors.
 * Docs: https://www.prisma.io/docs/orm/reference/error-reference
 */
const handlePrismaError = (err) => {
  switch (err.code) {
    // UNIQUE CONSTRAINT VIOLATION: e.g. duplicate email, or a user
    // reviewing the same tour twice (composite unique on tourId+userId).
    case "P2002": {
      const target = err.meta && err.meta.target;
      if (Array.isArray(target) && target.includes("tourId") && target.includes("userId"))
        return new AppError(
          "You have already submitted a review for this tour. Please update your existing review instead.",
          400
        );
      return new AppError(
        `Duplicate field value: ${target ? target.join(", ") : "unknown"}. Please use another value!`,
        400
      );
    }

    // FOREIGN KEY VIOLATION: the referenced row does not exist.
    case "P2003":
      return new AppError("Invalid foreign key reference.", 400);

    // VALUE TOO LONG FOR THE COLUMN TYPE.
    case "P2000":
      return new AppError("Too long value for a database column.", 400);

    // RECORD NOT FOUND in a `delete`/`update` (findUnique handled in factory).
    case "P2025":
      return new AppError("No record found with that id.", 404);

    // INCONSISTENT COLUMN DATA: e.g. String given where Integer expected.
    case "P2023":
      return new AppError("Inconsistent data: a numeric value was expected.", 400);

    default:
      return null;
  }
};

/**
 * DEVELOPMENT: full error payload (message + stack + original error).
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    message: err.message,
    error: err,
    stack: err.stack,
  });
};

/**
 * PRODUCTION: keep the payload clean; hide internal error details.
 * Operational errors (expected failures) keep their real message,
 * everything else is generic so no internals leak to clients.
 */
const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({ success: false, message: err.message });
  } else {
    console.error("ERROR 💥", err);
    res.status(500).json({ success: false, message: "Something went very wrong!" });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") return sendErrorDev(err, res);

  // ---- Production: normalize known error families -----------------
  let error = { ...err };
  error.message = err.message;

  // 1) Prisma engine errors (P2002, P2025, ...).
  const mapped = handlePrismaError(error);
  if (mapped) error = mapped;

  // 2) Invalid values that Prisma refused to even run (e.g. bad enum).
  if (err.name === "PrismaClientValidationError") {
    error = new AppError("Invalid input value(s) provided.", 400);
  }

  // 3) JWT errors (expired/invalid tokens).
  if (err.name === "JsonWebTokenError") {
    error = new AppError("Invalid token. Please log in again!", 401);
  }
  if (err.name === "TokenExpiredError") {
    error = new AppError("Your token has expired! Please log in again!", 401);
  }

  sendErrorProd(error, res);
};