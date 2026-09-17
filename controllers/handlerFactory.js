// ===================================================================
//  @file controllers/handlerFactory.js
//  @description A generic CRUD factory driven by a MODEL DESCRIPTOR.
//
//  MongoDB era: factory methods received a Mongoose model and chained
//  `Model.find().populate(...)`.
//  Prisma era: factory methods receive a descriptor (models/*.js) which
//  exposes `delegate` (the Prisma delegate: prisma.user, prisma.tour,
//  prisma.review), plus hooks such as beforeCreate/beforeUpdate,
//  defaultSelect, defaultScope, listInclude/getOneInclude and serialize.
//
//  The factory stays 100% generic: every CRUD behaviour difference lives
//  in each model descriptor, so the three controllers stay tiny.
// ===================================================================

const APIFeatures = require("../utils/apiFeatures.js");
const AppError = require("../utils/error.js");
const parseId = require("../utils/parseId.js");

/**
 * Resolve the Prisma read options (select/include) that match each model.
 * Prisma forbids mixing `select` and `include`, so we pick one:
 *   * models with sensitive columns (User)  -> explicit SELECT projection
 *   * models with relations to show         -> explicit INCLUDE relations
 */
const readOptions = (Model) => {
  if (Model.defaultSelect) return { select: Model.defaultSelect };
  if (Model.getOneInclude) return { include: Model.getOneInclude };
  return {};
};

/**
 * GET ONE  — GET /api/.../:id
 * Applies the default scope ONLY when the model opts in (scopeOnGetOne).
 */
exports.getOne = (Model) => async (req, res, next) => {
  try {
    const where = { id: parseId(Model, req.params.id) };
    if (Model.scopeOnGetOne && Model.defaultScope) Object.assign(where, Model.defaultScope);

    let doc = await Model.delegate.findUnique({ where, ...readOptions(Model) });

    // Prisma `findUnique` returns null instead of throwing P2025 -> 404 here.
    if (!doc) return next(new AppError(`No ${Model.modelName.toLowerCase()} found with that id`, 404));

    if (Model.serialize) doc = Model.serialize(doc);
    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

/**
 * GET ALL / LIST — GET /api/.../?filter&sort&page&limit
 * Runs the full APIFeatures pipeline (filter/sort/projection/pagination)
 * and always applies the model's default scope (faithful to the old
 * `pre(/^find/)` middleware on the Mongoose schema).
 *
 * @param {Object} Model          model descriptor
 * @param {Object} whereExtras    fixed extra filters, e.g. { tourId } on a nested route
 */
exports.getAll = (Model, whereExtras = {}) => async (req, res, next) => {
  try {
    const features = new APIFeatures(Model, req.query, req.formattedQuery, { whereExtras });
    features.filter().sort().limit().pagination();

    // Default scope (e.g. only active users / only non-premium tours).
    if (Model.defaultScope) Object.assign(features.spec.where, Model.defaultScope);

    // Relations to include (e.g. reviews for a tour, author for a review).
    if (Model.listInclude) features.spec.include = Model.listInclude;

    // Prisma forbids combining `select` and `include`. When the client
    // requested a projection (?fields=...) that wins and relations are
    // dropped (same effect as select + populate in the Mongo version).
    if (features.spec.select && features.spec.include) delete features.spec.include;

    const docs = await Model.delegate.findMany(features.spec);
    const rows = docs.map((doc) => (Model.serialize ? Model.serialize(doc) : doc));

    res.status(200).json({ success: true, results: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * CREATE ONE — POST /api/.../
 * Runs the model's beforeCreate hook (validation + hashing + nested
 * relation mapping) before calling prisma.<model>.create.
 *
 * @param {Array} afterCreate - taps fired AFTER creation (e.g. rating recalc)
 */
exports.createOne = (Model, ...afterCreate) => async (req, res, next) => {
  try {
    const clean = Model.beforeCreate ? await Model.beforeCreate(req.body) : req.body;

    let doc = await Model.delegate.create({
      data: clean,
      ...readOptions(Model),
    });

    for (const tap of afterCreate) await tap(doc, req, res);

    if (Model.serialize) doc = Model.serialize(doc);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

/**
 * UPDATE ONE — PATCH /api/.../:id
 * Runs the model's beforeUpdate hook (whitelisting + recompute derived
 * fields) and re-fetches the updated doc so the response is complete.
 *
 * @param {Array} afterUpdate - taps fired AFTER update (e.g. rating recalc)
 */
exports.updateOne = (Model, ...afterUpdate) => async (req, res, next) => {
  try {
    const id = parseId(Model, req.params.id);
    const clean = Model.beforeUpdate ? await Model.beforeUpdate(req.body) : req.body;

    let doc = await Model.delegate.update({
      where: { id },
      data: clean,
      ...readOptions(Model),
    });

    for (const tap of afterUpdate) await tap(doc, req, res);

    if (Model.serialize) doc = Model.serialize(doc);
    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE ONE — DELETE /api/.../:id
 * Prisma hard-deletes the row (PostgreSQL has no soft deletes here) and
 * replies 204 with an empty body.
 *
 * @param {Array} afterDelete - taps fired AFTER deletion (e.g. rating recalc)
 */
exports.deleteOne = (Model, ...afterDelete) => async (req, res, next) => {
  try {
    const doc = await Model.delegate.delete({ where: { id: parseId(Model, req.params.id) } });

    for (const tap of afterDelete) await tap(doc, req, res);

    res.status(204).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
};

module.exports = exports;