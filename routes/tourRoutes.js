/**
 * TOUR ROUTES CONFIGURATION
 */
const express = require("express");
const {
  getAllTours,
  createTour,
  getTour,
  updateTour,
  deleteTour,
  getToursWithin,
  aliasTopTours,
  getTourStats,
  getMonthlyPlan,
  getDistances,
} = require("../controllers/tourController.js");
const formatQuery = require("../middleware/formatQuery.js");
const { protect, restrictTo } = require("../controllers/authController.js");
const reviewRouter = require("./reviewRoutes.js");

const router = express.Router();

/**
 * ------------------------------------------------------------------
 * NESTED ROUTES
 * ------------------------------------------------------------------
 */
// Redirect /api/tours/:tourId/reviews to reviewRouter
router.use("/:tourId/reviews", reviewRouter);

/**
 * ------------------------------------------------------------------
 * AGGREGATION & STATISTICS ROUTES
 * ------------------------------------------------------------------
 */
// Get pre-calculated statistics (Admin only)
router.route("/tour-stats").get(protect, restrictTo("admin"), getTourStats);

// Get monthly scheduling plan for a specific year
router.route("/monthly-plan/:year").get(getMonthlyPlan);

/**
 * ------------------------------------------------------------------
 * ALIAS ROUTES (PRE-DEFINED FILTERS)
 * ------------------------------------------------------------------
 */
// Top 5 high-rated cheap tours
router
  .route("/top-tours")
  .get(protect, aliasTopTours, formatQuery, getAllTours);

/**
 * ------------------------------------------------------------------
 * MAIN CRUD ROUTES
 * ------------------------------------------------------------------
 */
router
  .route("/")
  .get(formatQuery, getAllTours) // Get all tours with optional filtering
  .post(protect, restrictTo("admin", "lead-guide"), createTour); // Create new tour (Staff only)

router
  .route("/:id")
  .get(getTour) // Get details of a single tour
  .patch(protect, restrictTo("admin", "lead-guide"), updateTour) // Update tour (Staff only)
  .delete(protect, restrictTo("admin"), deleteTour); // Delete tour (Admin only)

router
  .route("/tours-within/:distance/center/:latlng/unit/:unit")
  .get(getToursWithin);

router.route("/distances/:latlng/unit/:unit").get(getDistances);

module.exports = router;
