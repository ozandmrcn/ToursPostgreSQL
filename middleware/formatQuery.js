// ===================================================================
//  @file middleware/formatQuery.js
//  @description Prepare req.query for PostgreSQL / Prisma processing.
//
//  MongoDB era: this middleware wrote MongoDB operators into
//  `req.mongoQuery` ($gte, ...).
//  Prisma era: nothing Mongo-specific changes, but the result is stored
//  on `req.formattedQuery` and consumed by APIFeatures, which maps the
//  operators onto Prisma `where` clauses (see utils/apiFeatures.js).
//
//  Steps:
//  1) Merge req.query with req.queryAlias (from alias/dedicated middlewares).
//  2) Remove non-filter tokens: page, limit, sort, fields.
//  3) Convert gte/gt/lte/lt/ne into $gte/$gt/$lte/$lt/$ne (operator syntax).
// ===================================================================

module.exports = (req, res, next) => {
  // 1 + 2) Merge alias query and strip pagination/sorting/projection keys.
  const queryObj = { ...req.query, ...req.queryAlias };
  const excludedFields = ["page", "limit", "sort", "fields", "alias"];
  excludedFields.forEach((el) => delete queryObj[el]);

  // 3) Prefix comparison operators with `$` -> { price: { $gte: 400 } }.
  let queryStr = JSON.stringify(queryObj);
  queryStr = queryStr.replace(/\b(gte|gt|lte|lt|ne|eq)\b/g, (match) => `$${match}`);

  req.formattedQuery = JSON.parse(queryStr);
  next();
};