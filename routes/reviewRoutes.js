const express = require("express");
const {
  getAllReviews,
  createReview,
  deleteReview,
  updateReview,
  setTourUserIds,
  getReview,
} = require("../controllers/reviewController.js");
const { protect, restrictTo } = require("../controllers/authController.js");
const formatQuery = require("../middleware/formatQuery.js");

// mergeParams: true allows us to access parameters from other routers

// e.g. GET /tours/123/reviews -> tourId: 123 will be available in this router
const router = express.Router({ mergeParams: true });

/**
 * PUBLIC ROUTES
 * Everyone can see reviews, but must be logged in to interact.
 */
router.use(protect); // All review routes are protected

router
  .route("/")
  .get(formatQuery, getAllReviews) // Fetch all reviews (optionally filtered by tourId)
  .post(restrictTo("user", "admin"), setTourUserIds, createReview); // Only 'user' role can post reviews

router
  .route("/:id")
  .get(getReview)
  .patch(restrictTo("user", "admin"), updateReview)
  .delete(restrictTo("user", "admin"), deleteReview);

module.exports = router;
