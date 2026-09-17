// ===================================================================
//  @file controllers/reviewController.js
//  @description Review CRUD wired to the generic factory + rating recalc.
//
//  MongoDB era: post-save/post-remove hooks called calcAverageRatings.
//  Prisma has no such hooks, so the factory's after-* TAPS do it: each
//  create/update/delete tap re-runs the parent tour's rating aggregate
//  (see Review.calcAverageRatings in models/reviewModel.js).
// ===================================================================

const Review = require("../models/reviewModel.js");
const factory = require("./handlerFactory.js");

/**
 * NESTED ROUTE MIDDLEWARE
 * Sets the tourId/userId on the request body for nested review creation.
 * When POSTing to /tours/:tourId/reviews the tourId comes from the URL;
 * the userId always comes from the authenticated request (req.user).
 */
exports.setTourUserIds = (req, res, next) => {
  if (!req.body) req.body = {};

  if (!req.body.tourId) req.body.tourId = req.params.tourId;
  if (!req.body.userId) req.body.userId = req.user.id;
  next();
};

/**
 * GET ALL REVIEWS
 * Supports both /reviews and the nested /tours/:tourId/reviews route
 * (the merged `tourId` param becomes a fixed WHERE clause).
 */
exports.getAllReviews = (req, res, next) => {
  const whereExtras = {};
  if (req.params.tourId) whereExtras.tourId = Number(req.params.tourId);
  return factory.getAll(Review, whereExtras)(req, res, next);
};

/**
 * GET SINGLE REVIEW
 */
exports.getReview = factory.getOne(Review);

/**
 * CREATE REVIEW (+ recalc parent tour ratings)
 */
exports.createReview = factory.createOne(Review, async (doc) => {
  await Review.calcAverageRatings(doc.tourId);
});

/**
 * UPDATE REVIEW (+ recalc parent tour ratings)
 */
exports.updateReview = factory.updateOne(Review, async (doc) => {
  await Review.calcAverageRatings(doc.tourId);
});

/**
 * DELETE REVIEW (+ recalc parent tour ratings)
 */
exports.deleteReview = factory.deleteOne(Review, async (doc) => {
  await Review.calcAverageRatings(doc.tourId);
});