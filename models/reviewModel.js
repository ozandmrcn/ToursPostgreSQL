// ===================================================================
//  @file models/reviewModel.js
//  @description Review model descriptor + rating recalculation helper.
//
//  MongoDB era: `reviewModel.js` held a `statics.calcAverageRatings`
//  that ran aggregate pipelines on every save/remove (via post hooks).
//  Prisma has no post-save hooks, so the controllers call
//  `Review.calcAverageRatings(tourId)` EXPLICITLY after create/update/
//  delete. The shared factory wires that through its `afterCreate` /
//  `afterUpdate` / `afterDelete` taps (see handlerFactory.js).
// ===================================================================

const prisma = require("../config/database.js");
const AppError = require("../utils/error.js");

const Review = {
  modelName: "Review",
  delegate: prisma.review,

  // Whitelist for filtering/fields projection. `tourId` exists so the
  // nested route can be filtered on, and plain Clients can query them.
  allowFields: ["review", "rating", "createdAt", "updatedAt", "tourId", "userId"],

  // No scope: every review is public. No defaultSelect: reviews hold no secrets.
  defaultScope: null,
  defaultSelect: null,
  scopeOnGetOne: false,
  scopeOnWrite: false,

  // getOne/list default include: the review author (avatar for the UI).
  listInclude: {
    user: { select: { id: true, name: true, photo: true } },
  },
  getOneInclude: {
    user: { select: { id: true, name: true, photo: true } },
    tour: { select: { id: true, name: true, imageCover: true } },
  },
  createInclude: {
    user: { select: { id: true, name: true, photo: true } },
    tour: { select: { id: true, name: true, imageCover: true } },
  },

  serialize: (doc) => doc,
};

/** PRE-CREATE HOOK — validates + whitelists review create body. */
Review.beforeCreate = (data) => {
  if (!data.review || !String(data.review).trim())
    throw new AppError("Review cannot be empty", 400);
  if (data.rating === undefined || data.rating === null)
    throw new AppError("Rating cannot be empty", 400);

  const rating = Number(data.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new AppError("Rating must be between 1.0 and 5.0", 400);

  // tourId/userId are injected by ReviewController.setTourUserIds.
  return {
    review: String(data.review).trim(),
    rating,
    tourId: Number(data.tourId),
    userId: Number(data.userId),
  };
};

/** PRE-UPDATE HOOK — whitelist + validation on partial patch. */
Review.beforeUpdate = (data) => {
  const out = {};

  if (data.review !== undefined) {
    if (!String(data.review).trim()) throw new AppError("Review cannot be empty", 400);
    out.review = String(data.review).trim();
  }

  if (data.rating !== undefined) {
    const rating = Number(data.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new AppError("Rating must be between 1.0 and 5.0", 400);
    out.rating = rating;
  }

  return out;
};

/**
 * Recompute ratingQuantity/ratingsAverage on the PARENT tour after any
 * review write. Replaces the old Mongoose `statics.calcAverageRatings`:
 *   prisma.review.aggregate -> SQL:  SELECT COUNT(*), AVG(rating)
 *   prisma.tour.update      -> SQL:  UPDATE tours SET ... WHERE id = ?
 * A ratingsAverage rounded to 1 decimal, falling back to 4.5 when a tour
 * has no ratings yet (keeps the original `avgQuantity || 4.5` behaviour).
 */
Review.calcAverageRatings = async (tourId) => {
  const agg = await prisma.review.aggregate({
    where: { tourId },
    _count: { _all: true },
    _avg: { rating: true },
  });

  const ratingsQuantity = agg._count._all;
  const avg = agg._avg.rating;
  const ratingsAverage = avg ? Math.round(avg * 10) / 10 : 4.5;

  await prisma.tour.update({
    where: { id: tourId },
    data: { ratingsQuantity, ratingsAverage },
  });
};

module.exports = Review;