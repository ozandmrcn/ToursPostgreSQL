// ===================================================================
//  @file controllers/tourController.js
//  @description Tour CRUD + aggregation endpoints (Prisma + raw SQL).
//
//  CRUD handlers come from the generic factory (see handlerFactory.js).
//  The statistics/geospatial handlers previously ran the MongoDB
//  Aggregation Pipeline; the Prisma equivalents use `prisma.$queryRaw`
//  (tagged-template SQL) because aggregate GROUP BY / geospatial math
//  have no clean high-level Prisma API.
// ===================================================================

const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/error");
const prisma = require("../config/database.js");
const Tour = require("../models/tourModel");
const factory = require("./handlerFactory");

/**
 * GET TOUR STATISTICS
 * AVG/MIN/MAX per difficulty over tours rated >= 4.0, sorted by avg price.
 * SQL GROUP BY replaces the old `$group` aggregation stage. Column names
 * are camelCase in the DB, so they are double-quoted in SQL (PostgreSQL
 * folds unquoted identifiers to lowercase).
 */
exports.getTourStats = catchAsync(async (req, res, next) => {
  const stats = await prisma.$queryRaw`
    SELECT
      UPPER(difficulty)          AS difficulty,
      COUNT(*)::int              AS "numTours",
      SUM("ratingsQuantity")::int AS "numRatings",
      AVG("ratingsAverage")::float8 AS "avgRating",
      AVG(price)::float8         AS "avgPrice",
      MIN(price)::float8         AS "minPrice",
      MAX(price)::float8         AS "maxPrice"
    FROM tours
    WHERE "ratingsAverage" >= 4.0
    GROUP BY UPPER(difficulty)
    ORDER BY "avgPrice" ASC
  `;

  res.status(200).json({
    success: true,
    message: "Tour stats fetched successfully",
    results: stats.length,
    stats,
  });
});

/**
 * GET MONTHLY PLAN
 * How many tour starts occur per month in a given year.
 * startDates live in the `tour_start_dates` child table, so this JOINs
 * tours + tour_start_dates and aggregates by EXTRACT(MONTH ...).
 */
exports.getMonthlyPlan = catchAsync(async (req, res, next) => {
  const year = Number(req.params.year);

  const stats = await prisma.$queryRaw`
    SELECT
      EXTRACT(MONTH FROM ts."start_date")::int AS month,
      COUNT(*)::int AS "numTourStarts",
      ARRAY_AGG(t.name) AS tours
    FROM tour_start_dates ts
    JOIN tours t ON t.id = ts."tour_id"
    WHERE EXTRACT(YEAR FROM ts."start_date") = ${year}
    GROUP BY EXTRACT(MONTH FROM ts."start_date")
    ORDER BY month
  `;

  res.status(200).json({
    success: true,
    message: `Monthly plan fetched successfully for ${year}`,
    results: stats.length,
    stats,
  });
});

/**
 * ALIAS MIDDLEWARE: TOP 5 CHEAP TOURS
 * Prefills query parameters for the getAllTours handler.
 */
exports.aliasTopTours = (req, res, next) => {
  req.query = {
    limit: "5",
    sort: "-ratingsAverage,price",
    fields: "name,price,ratingsAverage,summary,difficulty",
  };
  next();
};

/**
 * GET ALL TOURS
 */
exports.getAllTours = factory.getAll(Tour);

/**
 * GET SINGLE TOUR
 * `getOneInclude` in the model descriptor attaches reviews + relations.
 */
exports.getTour = factory.getOne(Tour);

/**
 * CREATE TOUR
 */
exports.createTour = factory.createOne(Tour);

/**
 * UPDATE TOUR
 */
exports.updateTour = factory.updateOne(Tour);

/**
 * DELETE TOUR
 */
exports.deleteTour = factory.deleteOne(Tour);

/**
 * GET TOURS WITHIN RADIUS — GET /tours-within/:distance/center/:latlng/unit/:unit
 * Vanilla-SQL replacement for `$geoWithin: { $centerSphere }`.
 * The Haversine formula (great-circle distance) is expanded inline as
 * plain arithmetic; `startLocation.coordinates[0]=lng, [1]=lat` is read
 * straight out of the JSONB column. Premium tours stay hidden (same as
 * the Mongoose pre-/^find/ scope on Tour.find()).
 */
exports.getToursWithin = catchAsync(async (req, res, next) => {
  const { distance, latlng, unit } = req.params;
  const [lat, lng] = latlng.split(",");

  if (!lat || !lng) {
    return next(
      new AppError("Please provide latitude and longitude in the correct format (lat,lng).", 400),
    );
  }

  // Radius in radians: 3958.8 = Earth radius in miles, 6371 = km.
  const earthRadius = unit === "mi" ? 3958.8 : 6371;
  const radius = Number(distance) / earthRadius;

  const tours = await prisma.$queryRaw`
    SELECT t.*
    FROM tours t
    WHERE t."premium" = false
      AND t."startLocation" IS NOT NULL
      AND (
        6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(${Number(lat)})) *
            cos(radians((t."startLocation" -> 'coordinates' -> 1)::float8)) *
            cos(radians((t."startLocation" -> 'coordinates' -> 0)::float8) - radians(${Number(lng)})) +
            sin(radians(${Number(lat)})) *
            sin(radians((t."startLocation" -> 'coordinates' -> 1)::float8))
          ))
        )
      ) < ${radius}
  `;

  // Keep the API shape identical: raw rows serialized like factory rows.
  const data = tours.map((t) => Tour.serialize(t));

  res.status(200).json({
    success: true,
    results: tours.length,
    data,
  });
});

/**
 * GET DISTANCES — GET /distances/:latlng/unit/:unit
 * Vanilla-SQL replacement for the `$geoNear` aggregation stage.
 * Returns tour name + great-circle distance from the given point.
 */
exports.getDistances = catchAsync(async (req, res, next) => {
  const { latlng, unit } = req.params;
  const [lat, lng] = latlng.split(",");

  if (!lat || !lng) {
    return next(
      new AppError("Please provide latitude and longitude in the correct format (lat,lng).", 400),
    );
  }

  // The Haversine above uses the Earth radius in km, so convert the
  // km result into the requested unit: km -> miles (0.621371) / km (1).
  const multiplier = unit === "mi" ? 0.621371 : 1;

  const distances = await prisma.$queryRaw`
    SELECT DISTINCT
      t.name AS name,
      ROUND(
        6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(${Number(lat)})) *
            cos(radians((t."startLocation" -> 'coordinates' -> 1)::float8)) *
            cos(radians((t."startLocation" -> 'coordinates' -> 0)::float8) - radians(${Number(lng)})) +
            sin(radians(${Number(lat)})) *
            sin(radians((t."startLocation" -> 'coordinates' -> 1)::float8))
          ))
        ) * ${multiplier},
        2
      ) AS distance
    FROM tours t
    WHERE t."startLocation" IS NOT NULL
    ORDER BY distance
  `;

  res.status(200).json({
    success: true,
    message: "Distances calculated successfully",
    results: distances.length,
    data: distances,
  });
});