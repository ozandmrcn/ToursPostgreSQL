// ===================================================================
//  @file utils/parseId.js
//  @description Convert a URL :id param into a PostgreSQL integer PK.
//
//  MongoDB era: ids were 24-char ObjectIds («5c88fa8cf4afda39709c2966»).
//  PostgreSQL era: ids are SERIAL integers (auto-increment), so "abc"
//  is invalid. Prisma would throw a ClientValidationError on bad ids;
//  we catch it here and return a clean 400 instead (mirrors the old
//  Mongoose CastError behaviour: «Invalid id: value.>).
// ===================================================================

const AppError = require("./error.js");

/**
 * @param {Object} Model - Model descriptor (for the model name in messages).
 * @param {string} value - Raw URL param (e.g. req.params.id).
 * @returns {number} Parsed positive integer id.
 */
module.exports = (Model, value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(`Invalid ${Model.modelName.toLowerCase()} id: ${value}.`, 400);
  }
  return id;
};