// ===================================================================
//  @file controllers/userController.js
//  @description User CRUD, profile update + photo upload (Prisma).
//  Kept structurally identical to the MongoDB version: only the two
//  Mongoose call sites (`findByIdAndUpdate`) were swapped for Prisma.
// ===================================================================

const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/error");
const prisma = require("../config/database.js");
const factory = require("./handlerFactory");
const filterObject = require("../utils/filterObjects");
const User = require("../models/userModel");
const multer = require("multer");
const sharp = require("sharp");

/**
 * IMAGE UPLOAD CONFIGURATION
 * Using Multer to handle multipart/form-data (file uploads).
 */
const multerStorage = multer.memoryStorage(); // Store image in memory as a buffer

const multerFilter = (req, file, cb) => {
  // Only allow image files
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("Not an image! Please upload only images.", 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

/**
 * USER IMAGE PROCESSING
 * Resizes and converts uploaded image to WebP format using Sharp.
 */
exports.uploadUserPhoto = upload.single("avatar");

exports.resizeUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  // 1) Create a unique filename
  req.file.filename = `user-${req.user.id}-${Date.now()}.webp`;

  // 2) Process image: resize to square, convert to webp, set quality, and save to disk
  await sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat("webp")
    .webp({ quality: 70 })
    .toFile(`public/img/users/${req.file.filename}`);

  next();
});

/**
 * UPDATE LOGGED-IN USER DATA
 * Allows the current user to update their own profile info (name, photo).
 * The write is scoped to `req.user.id` (never trusts a client-sent id)
 * and returned through User.defaultSelect so `password` stays hidden.
 */
exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) Error if user tries to update password here
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        "This route is not for password updates. Please use /api/users/update-password",
        400,
      ),
    );
  }

  // 2) Filter body to only allow specific fields
  const filteredBody = filterObject(req.body, "name", "email");
  if (req.file) filteredBody.photo = req.file.filename;

  // 3) Update user document (SELECT projection keeps the response clean)
  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: filteredBody,
    select: User.defaultSelect,
  });

  res.status(200).json({
    success: true,
    message: "Profile updated successfully!",
    data: updatedUser,
  });
});

/**
 * FETCH ALL USERS
 */
exports.getAllUsers = factory.getAll(User);

/**
 * FETCH SINGLE USER
 */
exports.getUser = factory.getOne(User);

/**
 * CREATE NEW USER (ADMIN ONLY)
 */
exports.createUser = factory.createOne(User);

/**
 * UPDATE USER (ADMIN ONLY)
 */
exports.updateUser = factory.updateOne(User);

/**
 * DELETE USER (ADMIN ONLY)
 */
exports.deleteUser = factory.deleteOne(User);

/**
 * ACTIVATE / DEACTIVATE ACCOUNT (ADMIN ONLY)
 * Directly modifies the 'active' status. Note that `prisma.user.update`
 * never applies the `active: true` default scope, so currently-inactive
 * users can be found and toggled back on (same as the old skipActiveFilter).
 */
exports.activateAccount = catchAsync(async (req, res, next) => {
  const { active } = req.body;

  const user = await prisma.user.update({
    where: { id: Number(req.params.id) },
    data: { active },
    select: User.defaultSelect,
  });

  if (!user) {
    return next(new AppError("No user found with that ID!", 404));
  }

  res.status(200).json({
    success: true,
    message: `User account ${active ? "activated" : "deactivated"} successfully!`,
    data: user,
  });
});