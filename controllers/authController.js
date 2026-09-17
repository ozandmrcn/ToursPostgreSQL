// ===================================================================
//  @file controllers/authController.js
//  @description Authentication & authorization (JWT + bcrypt + cookies).
//
//  Everything Mongoose-specific here is replaced with Prisma calls:
//    User.findByEmail(...) -> prisma.user.findUnique({ where: { email } })
//    user.save()           -> prisma.user.update({ where: { id }, data: {...} })
//  Password hashing is unchanged: bcrypt (cost 12), the same as before.
// ===================================================================

const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const prisma = require("../config/database.js");
const User = require("../models/userModel.js");
const AppError = require("../utils/error.js");
const sendMail = require("../utils/sendMail.js");

// ------------------------------------------------------------------
// TOKEN HELPERS
// ------------------------------------------------------------------

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

/**
 * Attach the JWT cookie + send the response for signUp/login/reset flows.
 * The DB row is re-projected through User.defaultSelect so `password`
 * never accidentally leaks into the response body.
 */
const createSendToken = (user, statusCode, res, message) => {
  const token = signToken(user.id);

  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  res.cookie("jwt", token, cookieOptions);
  res.status(statusCode).json({
    success: true,
    message,
    token,
    data: { user },
  });
};

// ------------------------------------------------------------------
// AUTHENTICATION
// ------------------------------------------------------------------

/**
 * SIGN UP — POST /api/v1/users/signup
 * Runs the model hook that validates + hashes the password (bcrypt 12),
 * then persists the new user. Duplicate emails hit P2002 and are mapped
 * to a friendlier message in errorController.
 */
exports.signUp = async (req, res, next) => {
  try {
    const data = await User.beforeCreate({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm,
    });

    const newUser = await prisma.user.create({
      data,
      select: User.defaultSelect,
    });

    createSendToken(newUser, 201, res, "signup successful");
  } catch (err) {
    next(err);
  }
};

/**
 * LOGIN — POST /api/v1/users/login
 * Password column is selected explicitly here (password: true) so bcrypt
 * has something to compare against. Inactive (soft-blocked) users are
 * rejected with 401.
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return next(new AppError("Please provide email and password!", 400));

    const user = await User.findByEmail(email, { ...User.defaultSelect, password: true });

    if (!user || !(await bcrypt.compare(password, user.password)))
      return next(new AppError("Incorrect email or password", 401));

    if (user.active === false)
      return next(new AppError("Your account has been deactivated.", 401));

    createSendToken(user, 200, res, "login successful");
  } catch (err) {
    next(err);
  }
};

/**
 * LOGOUT — GET /api/v1/users/logout
 * Overwrites the jwt cookie with a garbage short-lived value.
 */
exports.logout = (req, res) => {
  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ success: true, message: "You have been logged out." });
};

/**
 * PROTECT — verify the bearer/cookie token and load req.user.
 * PostgreSQL comparison notes:
 *   * user is loaded with `where: { id, active: true }` (scoped select),
 *     equivalent of the old `User.find({ _id, active: { $ne: false } }).select(...)`.
 *   * `passChangedAt` is a timestamptz; Unix seconds = getTime() / 1000
 *     compared against the token `iat` (seconds since epoch).
 */
exports.protect = async (req, res, next) => {
  try {
    // 1) Extract the token from headers or cookie.
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token)
      return next(new AppError("You are not logged in! Please log in to get access.", 401));

    // 2) Verify the signature + expiry.
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

    // 3) Make sure the user still exists AND is still active.
    // findFirst (not findUnique) because `active` is part of the WHERE.
    const currentUser = await prisma.user.findFirst({
      where: { id: decoded.id, active: true },
      select: { ...User.defaultSelect, passChangedAt: true },
    });

    if (!currentUser)
      return next(new AppError("The user belonging to this token no longer exists.", 401));

    // 4) Check if password was changed after the token was issued.
    const changedAt = currentUser.passChangedAt
      ? Math.floor(new Date(currentUser.passChangedAt).getTime() / 1000)
      : 0;
    if (decoded.iat < changedAt)
      return next(new AppError("User recently changed password! Please log in again.", 401));

    req.user = currentUser;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * RESTRICT TO — role-based authorization gate (admin / lead-guide / user).
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission to perform this action", 403));
    }
    next();
  };
};

// ------------------------------------------------------------------
// PASSWORD RESET
// ------------------------------------------------------------------

/**
 * FORGOT PASSWORD — POST /api/v1/users/forgot-password
 * Generates a random reset token, stores ONLY its sha256 hash (never the
 * raw token), and emails the user a link containing the raw token.
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findByEmail(req.body.email);
    if (!user) return next(new AppError("There is no user with that email.", 404));

    const { resetToken, passwordResetToken, passwordResetExpires } = User.createResetToken();

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken, passwordResetExpires },
    });

    const resetURL = `${req.protocol}://${req.get("host")}/api/v1/users/resetPassword/${resetToken}`;

    try {
      await sendMail({
        email: user.email,
        subject: "Your password reset token (valid for 15 min)",
        text: `Forgot your password? Submit a PATCH request with your new password and passwordConfirm to: ${resetURL}.\nIf you didn't forget your password, please ignore this email!`,
      });
    } catch (mailErr) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: null, passwordResetExpires: null },
      });
      return next(new AppError("There was an error sending the email. Try again later!", 500));
    }

    res.status(200).json({ success: true, message: "Token sent to email!" });
  } catch (err) {
    next(err);
  }
};

/**
 * RESET PASSWORD — PATCH /api/v1/users/reset-password/:token
 * Re-hashes the raw token and matches it against the stored hash, also
 * enforcing the 15-minute expiry.
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) return next(new AppError("Token is invalid or has expired", 400));

    if (req.body.password !== req.body.passwordConfirm)
      return next(new AppError("Passwords are not the same!", 400));
    if (!req.body.password || req.body.password.length < 8)
      return next(new AppError("A user password must have at least 8 characters", 400));

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(req.body.password, 12),
        passChangedAt: new Date(Date.now() - 1000), // -1s so already-issued tokens die
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    const updated = await User.findById(user.id, User.defaultSelect);
    createSendToken(updated, 200, res, "Password reset successful");
  } catch (err) {
    next(err);
  }
};

/**
 * UPDATE PASSWORD (authenticated) — PATCH /api/v1/users/update-password
 */
exports.updatePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id, { id: true, password: true });

    if (!(await bcrypt.compare(req.body.passwordCurrent, user.password)))
      return next(new AppError("Your current password is wrong.", 401));

    if (req.body.password !== req.body.passwordConfirm)
      return next(new AppError("Passwords are not the same!", 400));
    if (!req.body.password || req.body.password.length < 8)
      return next(new AppError("A user password must have at least 8 characters", 400));

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(req.body.password, 12),
        passChangedAt: new Date(Date.now() - 1000),
      },
    });

    const updated = await User.findById(user.id, User.defaultSelect);
    createSendToken(updated, 200, res, "Password updated");
  } catch (err) {
    next(err);
  }
};