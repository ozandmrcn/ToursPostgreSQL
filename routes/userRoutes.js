/**
 * USER ROUTES CONFIGURATION
 */
const express = require("express");

const {
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
  createUser,
  activateAccount,
  updateMe,
  uploadUserPhoto,
  resizeUserPhoto,
} = require("../controllers/userController.js");

const {
  signUp,
  login,
  logout,
  forgotPassword,
  resetPassword,
  updatePassword,
  protect,
  restrictTo,
} = require("../controllers/authController.js");

const formatQuery = require("../middleware/formatQuery.js");

const router = express.Router();

/**
 * ------------------------------------------------------------------
 * 1) AUTHENTICATION & SECURITY ROUTES (PUBLIC)
 * ------------------------------------------------------------------
 * These routes are accessible without logging in (e.g., for new users or password recovery).
 */
router.post("/signup", signUp);
router.post("/login", login);
router.get("/logout", logout); // Note: Logout is a GET request for easy browser/cookie clearing
router.post("/forgot-password", forgotPassword);
router.patch("/reset-password/:token", resetPassword);

/**
 * ------------------------------------------------------------------
 * 2) ACCOUNT MANAGEMENT ROUTES (AUTHENTICATED)
 * ------------------------------------------------------------------
 */
// Protect all subsequent routes (middleware stack)
router.use(protect);

router.patch("/update-password", updatePassword);
router.patch("/update-me", uploadUserPhoto, resizeUserPhoto, updateMe);

/**
 * ------------------------------------------------------------------
 * 3) USER MANAGEMENT CRUD (ADMIN ONLY)
 * ------------------------------------------------------------------
 */
// Apply restrictTo middleware to all routes below this point
router.use(restrictTo("admin"));

router.post("/activate/:id", activateAccount);

router
  .route("/")
  .get(formatQuery, getAllUsers) // Fetch list of users
  .post(createUser); // Create user manually

router
  .route("/:id")
  .get(getUser) // Get specific user details
  .patch(updateUser) // Partially update user
  .delete(deleteUser); // Delete user permanently

module.exports = router;
