// ===================================================================
//  @file models/userModel.js
//  @description User model descriptor + data-access helpers (Prisma).
//
//  This module replaces the old Mongoose `userSchema`. Instead of a
//  schema class we export a POJO ("descriptor") consumed by the shared
//  handlerFactory, plus a few explicit helper functions for the auth
//  flows. Key MongoDB -> PostgreSQL differences documented inline.
// ===================================================================

const validator = require("validator");
const bcrypt = require("bcrypt");
const prisma = require("../config/database.js");
const AppError = require("../utils/error.js");

const User = {
  modelName: "User",
  delegate: prisma.user,

  /**
   * Whitelist of columns clients may filter/sort/project (§fields=).
   * `password`, `passChangedAt`, `passwordResetToken`... are NOT listed,
   * so they can never be leaked through the query-string features.
   */
  allowFields: ["id", "name", "email", "photo", "role", "active", "createdAt"],

  /**
   * Default SELECT projection.
   * Mongoose had `select:false` on password/active; Prisma has no such
   * concept, so we always provide an explicit `select` list that simply
   * omits the sensitive columns whenever the factory queries users.
   */
  defaultSelect: {
    id: true,
    name: true,
    email: true,
    photo: true,
    role: true,
    active: true,
    createdAt: true,
  },

  /**
   * Default WHERE scope = only `active` users (the old
   * `pre(/^find/)` middleware that filtered `active: { $ne: false }`).
   */
  defaultScope: { active: true },

  // The old factory passed `skipActiveFilter` to most operations:
  //   * getOne  -> inactive users were still fetchable by id  => NO scope.
  //   * update/delete -> admin operated on any user            => NO scope.
  scopeOnGetOne: false,
  scopeOnWrite: false,

  serialize: (doc) => doc,
};

/**
 * PRE-CREATE HOOK (replaces userSchema.pre("save") password hashing).
 * Returns a clean, validated object ready for `prisma.user.create`.
 * Used both by the factory (`createUser`) and by auth `signUp`.
 */
User.beforeCreate = async (data) => {
  if (!data.name) throw new AppError("Please tell us your name!", 400);
  if (!data.email) throw new AppError("Please provide your email!", 400);
  if (!data.password) throw new AppError("Please provide a password", 400);
  if (data.password.length < 8)
    throw new AppError("A user password must have at least 8 characters", 400);
  if (!validator.isEmail(data.email))
    throw new AppError("Please provide a valid email", 400);
  if (data.passwordConfirm !== undefined && data.passwordConfirm !== data.password)
    throw new AppError("Passwords are not the same!", 400);

  delete data.passwordConfirm; // never stored in the DB

  // bcrypt cost 12, same as the original Mongoose pre-save hook.
  data.password = await bcrypt.hash(data.password, 12);
  return data;
};

// ------------------------------------------------------------------
// Explicit lookup helpers (authController relies on these).
// ------------------------------------------------------------------

/** Find by unique email. `select` must be passed explicitly. */
User.findByEmail = (email, select) =>
  prisma.user.findUnique({ where: { email }, select });

/** Find by numeric PK. `select` must be passed explicitly. */
User.findById = (id, select) => prisma.user.findUnique({ where: { id }, select });

/** Generate the reset token fields on a user (crypto). */
User.createResetToken = () => {
  const resetToken = require("crypto").randomBytes(32).toString("hex");
  return {
    resetToken,
    passwordResetToken: require("crypto")
      .createHash("sha256")
      .update(resetToken)
      .digest("hex"),
    passwordResetExpires: new Date(Date.now() + 15 * 60 * 1000), // valid 15 min
  };
};

module.exports = User;