// ===================================================================
//  @file utils/apiFeatures.js
//  @description Advanced query capabilities for Prisma / PostgreSQL.
//
//  MongoDB era: this class chained onto a Mongoose Query object
//  (`.find().sort().select().skip().limit()`).
//  Prisma era: Prisma queries do not chain; instead you hand a plain
//  options object to `findMany`. This class therefore BUILDS that
//  options object (`spec`) instead of wrapping a query:
//
//    spec = { where, orderBy, select, skip, take, include }
//
//  URL query tokens still work exactly like before:
//    ?maxGroupSize=10&duration[lte]=20&sort=-price&fields=name,price&page=2&limit=5
// ===================================================================

/**
 * Coerce URL query strings into the right JS type for Prisma.
 * Prisma is strictly typed: a String "400" is NOT a valid Float.
 * Numbers are converted, everything else stays a string.
 */
const coerce = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return value;
  const num = Number(trimmed);
  return Number.isNaN(num) ? value : num;
};

class APIFeatures {
  /**
   * @param {Object} model - Model descriptor from models/*.js
   *   { delegate, allowFields, defaultSelect, listInclude, defaultScope }
   * @param {Object} params - Raw request query (req.query): sort/fields/page/limit.
   * @param {Object} formattedParams - Operator-formatted filters (req.formattedQuery):
   *   { price: { $gte: 400 }, maxGroupSize: 10 } produced by formatQuery middleware.
   * @param {Object} [options] - { whereExtras } extra fixed filters (e.g. { tourId } on nested routes).
   */
  constructor(model, params, formattedParams, { whereExtras = {} } = {}) {
    this.model = model;
    this.params = params;
    this.formattedParams = formattedParams;

    // The Prisma `findMany` options accumulate here.
    this.spec = {
      where: { ...whereExtras },
      orderBy: [{ createdAt: "desc" }], // Prisma default: newest first
      skip: 0,
      take: 10,
    };

    // Default projection (omit sensitive columns such as `password`).
    if (model.defaultSelect) this.spec.select = { ...model.defaultSelect };

    // include (e.g. review.user) is merged by the factory, not here.
  }

  /**
   * FILTERING  — `?price[gte]=400` => `where: { price: { gte: 400 } }`
   * MongoDB used `$gte`; Prisma uses the same operators WITHOUT the `$`,
   * so we simply strip the dollar sign.
   */
  filter() {
    const where = { ...this.spec.where };

    for (const [key, value] of Object.entries(this.formattedParams)) {
      // Whitelist: only queryable columns of this model may be filtered.
      if (!this.model.allowFields.includes(key)) continue;

      if (value && typeof value === "object" && !Array.isArray(value)) {
        // Operator field, e.g. { $gte: 400 } turning into { gte: 400 }.
        where[key] = {};
        for (const [op, val] of Object.entries(value)) {
          where[key][op.replace("$", "")] = coerce(val);
        }
      } else {
        // Exact match: { maxGroupSize: 10 }
        where[key] = coerce(value);
      }
    }

    this.spec.where = where;
    return this;
  }

  /**
   * SORTING — `?sort=-price,ratingsAverage` => orderBy price desc, ratings asc.
   * `-field` means descending, exactly like the MongoDB version.
   */
  sort() {
    const getters = (field) => (field.startsWith("-") ? ["desc", field.slice(1)] : ["asc", field]);

    if (this.params.sort) {
      this.spec.orderBy = this.params.sort
        .split(",")
        .map(getters)
        .filter(([, field]) => this.model.allowFields.includes(field)) // whitelist
        .map(([direction, field]) => ({ [field]: direction }));
    } else {
      this.spec.orderBy = [{ createdAt: "desc" }];
    }
    return this;
  }

  /**
   * FIELD LIMITING (projection) — `?fields=name,price` => select only those columns.
   * The id is always added so clients can reference the record.
   */
  limit() {
    if (this.params.fields) {
      const select = { id: true };
      this.params.fields
        .split(",")
        .map((f) => f.trim())
        .filter((field) => this.model.allowFields.includes(field))
        .forEach((field) => {
          select[field] = true;
        });
      this.spec.select = select;
    }
    return this;
  }

  /**
   * PAGINATION — `?page=2&limit=5` => SQL OFFSET/LIMIT (skip/take in Prisma).
   * Faithful to the original defaults: page starts at 1, limit at 100.
   */
  pagination() {
    const page = Number(this.params.page) || 1;
    const take = Number(this.params.limit) || 100;
    this.spec.skip = (page - 1) * take;
    this.spec.take = take;
    return this;
  }
}

module.exports = APIFeatures;