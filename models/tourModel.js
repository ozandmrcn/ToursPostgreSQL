// ===================================================================
//  @file models/tourModel.js
//  @description Tour model descriptor + serialize/nesting helpers (Prisma).
//
//  The old MongoDB document embedded `locations` and `startDates` and
//  referenced `guides` in one array. PostgreSQL normalizes these:
//    * locations  -> tour_locations  (1-N children, lat/lon columns)
//    * startDates -> tour_start_dates (1-N children)
//    * guides     -> implicit M2M table (_GuideToTour)
//  The descriptor below teaches the shared factory how to read/write
//  that shape while keeping the REST API contract 100% unchanged.
// ===================================================================

const prisma = require("../config/database.js");
const AppError = require("../utils/error.js");

const DIFFICULTIES = ["easy", "medium", "difficult"];

const Tour = {
  modelName: "Tour",
  delegate: prisma.tour,

  /**
   * Whitelist of queryable/projectable columns.
   * `startLocation`/`images` are deliberately excluded: they hold JSON,
   * which the query-string DSL cannot filter safely against.
   */
  allowFields: [
    "name",
    "slug",
    "duration",
    "maxGroupSize",
    "difficulty",
    "ratingsAverage",
    "ratingsQuantity",
    "price",
    "priceDiscount",
    "summary",
    "description",
    "imageCover",
    "createdAt",
    "premium",
    "hour",
  ],

  // No defaultSelect: tours hold no secrets, so scalar columns all come back.
  defaultSelect: null,

  /**
   * Default scope: hide premium (embedded "secret" tours) the same way
   * the old `pre(/^find/)` middleware did (`premium: { $ne: true }`).
   */
  defaultScope: { premium: false },

  // getOne DID keep premium tours hidden in the original code => apply scope.
  scopeOnGetOne: true,
  scopeOnWrite: false,

  /** Relation include used by the canonical tour-list query. */
  listInclude: {
    locations: { select: { longitude: true, latitude: true, description: true, address: true, day: true } },
    startDates: { select: { startDate: true } },
    guides: { select: { id: true, name: true, email: true, photo: true, role: true } },
  },

  /** include used when creating a tour (need the created children back). */
  createInclude: {
    locations: true,
    startDates: true,
    guides: true,
  },

  /** include used on getOne/tour-with-reviews. */
  getOneInclude: {
    locations: { select: { longitude: true, latitude: true, description: true, address: true, day: true } },
    startDates: { select: { startDate: true } },
    guides: { select: { id: true, name: true, email: true, photo: true, role: true } },
    reviews: {
      include: {
        user: { select: { id: true, name: true, photo: true } },
      },
    },
  },

  /**
   * SERIALIZER — restores the old Mongo document shape in the response:
   *   * hour computed from duration (was a mongoose virtual),
   *   * locations rebuilt as { type: "Point", coordinates: [lng, lat], ... },
   *   * startDates flattened back into an array of ISO timestamps.
   */
  serialize(doc) {
    if (!doc) return doc;
    const out = { ...doc };

    if (out.duration !== undefined) out.durationWeeks = out.duration / 7;

    if (Array.isArray(out.locations)) {
      out.locations = out.locations.map((l) => ({
        type: "Point",
        coordinates: [l.longitude, l.latitude],
        description: l.description,
        address: l.address,
        day: l.day,
      }));
    }

    if (Array.isArray(out.startDates)) out.startDates = out.startDates.map((s) => s.startDate);

    return out;
  },
};

/**
 * PRE-CREATE HOOK — validation + computed fields + nested-relation mapping.
 * Returns a nested `data` object directly usable by `prisma.tour.create`.
 */
Tour.beforeCreate = (data) => {
  const d = { ...data };

  // ---- Mongoose-style validation (synchronous) ---------------------------
  if (!d.name) throw new AppError("A tour must have a name", 400);
  if (d.name.length > 40)
    throw new AppError("A tour name must have less or equal then 40 characters", 400);
  if (d.name.length < 10)
    throw new AppError("A tour name must have more or equal then 10 characters", 400);
  if (d.duration === undefined) throw new AppError("A tour must have a duration", 400);
  if (d.maxGroupSize === undefined) throw new AppError("A tour must have a group size", 400);
  if (!d.difficulty) throw new AppError("A tour must have a difficulty", 400);
  if (!DIFFICULTIES.includes(d.difficulty))
    throw new AppError("Difficulty is either: easy, medium, or difficult", 400);
  if (d.price === undefined) throw new AppError("A tour must have a price", 400);
  if (!d.summary) throw new AppError("A tour must have a description", 400);
  if (!d.imageCover) throw new AppError("A tour must have a cover image", 400);
  if (d.priceDiscount !== undefined && d.priceDiscount >= d.price)
    throw new AppError("Discount price should be below regular price", 400);

  // ---- Computed / stored fields (hour replaces the old virtual) ----------
  d.slug = d.name.toLowerCase().split(" ").join("-");
  d.hour = d.duration * 24;
  d.premium = d.premium ?? false;

  // ---- Nested relations ----------------------------------------------------
  if (Array.isArray(d.locations)) {
    if (d.locations.length) {
      d.locations = {
        create: d.locations.map((l) => ({
          description: l.description,
          address: l.address,
          day: l.day,
          longitude: l.coordinates ? l.coordinates[0] : null,
          latitude: l.coordinates ? l.coordinates[1] : null,
        })),
      };
    } else {
      delete d.locations; // empty arrays are not creatable in Prisma
    }
  }

  if (Array.isArray(d.startDates)) {
    if (d.startDates.length) {
      d.startDates = { create: d.startDates.map((s) => ({ startDate: new Date(s.startDate) })) };
    } else {
      delete d.startDates;
    }
  }

  if (Array.isArray(d.guides)) {
    d.guides = { connect: d.guides.map((guideId) => ({ id: Number(guideId) })) };
  }

  return d;
};

/**
 * PRE-UPDATE HOOK — whitelists the scalar columns + recomputes derived
 * values. Nested relations (if present) are replaced wholesale.
 */
Tour.beforeUpdate = (data) => {
  const copy = { ...data };
  const out = {};

  const scalarFields = [
    "name",
    "duration",
    "maxGroupSize",
    "difficulty",
    "ratingsAverage",
    "ratingsQuantity",
    "price",
    "priceDiscount",
    "summary",
    "description",
    "imageCover",
    "premium",
    "startLocation",
  ];
  scalarFields.forEach((f) => {
    if (copy[f] !== undefined) out[f] = copy[f];
  });

  if (out.name !== undefined) out.slug = out.name.toLowerCase().split(" ").join("-");
  if (out.duration !== undefined) out.hour = out.duration * 24;
  if (out.priceDiscount !== undefined && out.price !== undefined && out.priceDiscount >= out.price)
    throw new AppError("Discount price should be below regular price", 400);

  if (Array.isArray(copy.locations)) {
    out.locations = {
      deleteMany: {},
      create: copy.locations.map((l) => ({
        description: l.description,
        address: l.address,
        day: l.day,
        longitude: l.coordinates ? l.coordinates[0] : null,
        latitude: l.coordinates ? l.coordinates[1] : null,
      })),
    };
  }

  if (Array.isArray(copy.startDates)) {
    out.startDates = {
      deleteMany: {},
      create: copy.startDates.map((s) => ({ startDate: new Date(s.startDate) })),
    };
  }

  if (Array.isArray(copy.guides)) {
    out.guides = { set: copy.guides.map((guideId) => ({ id: Number(guideId) })) };
  }

  return out;
};

module.exports = Tour;