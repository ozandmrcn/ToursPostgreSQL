// ===================================================================
//  @file dev-data/data/dev-commands.js
//  @description Development data import/delete tools (Prisma / PostgreSQL).
//
//  Formerly a Mongoose seeder, this now inserts the JSON fixtures into
//  PostgreSQL through the Prisma client. Because our relational schema
//  splits embedded MongoDB arrays into child tables, the importer must
//  "normalize" the old documents:
//
//    Mongo embedded field      -> PostgreSQL representation
//    -------------------------    ----------------------------
//    tour.guides[]              -> M2M connect to users (via _TourToUser)
//    tour.locations[]           -> rows in tour_locations (lng/lat columns)
//    tour.startDates[]          -> rows in tour_start_dates
//    review.tour / review.user  -> FK columns (ObjectId remapped to new ids)
//
//  Run:  npm run import   |   npm run delete
// ===================================================================

const fs = require("fs");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

// PrismaClient reads DATABASE_URL from the environment (.env loaded below).
const prisma = new PrismaClient();
require("dotenv").config();

// Load the raw JSON fixtures (unchanged from the MongoDB era).
const users = JSON.parse(fs.readFileSync(`${__dirname}/users.json`, "utf-8"));
const tours = JSON.parse(fs.readFileSync(`${__dirname}/tours.json`, "utf-8"));
const reviews = JSON.parse(fs.readFileSync(`${__dirname}/reviews.json`, "utf-8"));

// The classic course password — re-hashed onto the admin account so the
// Postman collection can always log in as admin@natours.io / test1234.
const ADMIN_BOOT_PASSWORD = "test1234";

// Mimics the old Mongoose `pre('save')` hook that derived slug + hour.
const computeSlugAndHour = (tour) => {
  tour.slug = tour.name.toLowerCase().split(" ").join("-");
  if (tour.duration) tour.hour = tour.duration * 24;
};

const importData = async () => {
  // NOTE: a transaction wraps the whole import, so if anything fails the
  // DB is left untouched (all-or-nothing).
  await prisma.$transaction(async (tx) => {
    // 1) USERS ----------------------------------------------------------
    // Insert each user one-by-one (createMany does not return ids, and we
    // need the new numeric PK to remap guides/reviews below).
    const userEmailToId = {};
    for (const u of users) {
      // Keep pre-hashed fixture passwords for everyone, EXCEPT guarantee
      // the admin credentials used by the Postman collection.
      const password =
        u.email === "admin@natours.io"
          ? await bcrypt.hash(ADMIN_BOOT_PASSWORD, 12)
          : u.password;

      // Prisma enum member is `lead_guide`; the @map in schema.prisma takes
      // care of storing the hyphenated string ('lead-guide') in PostgreSQL.
      const role = u.role === "lead-guide" ? "lead_guide" : u.role;

      const created = await tx.user.create({
        data: {
          name: u.name,
          email: u.email,
          role, // 'lead-guide' maps through the Prisma enum
          photo: u.photo,
          active: u.active,
          password,
        },
      });
      userEmailToId[u._id] = created.id; // old ObjectId -> new integer id
    }

    // 2) TOURS ----------------------------------------------------------
    // The old pre-save hook computed slug/hour even during imports.
    const tourOldIdToNewId = {};
    for (const t of tours) {
      computeSlugAndHour(t);

      const created = await tx.tour.create({
        data: {
          name: t.name,
          slug: t.slug,
          duration: t.duration,
          maxGroupSize: t.maxGroupSize,
          difficulty: t.difficulty,
          ratingsAverage: t.ratingsAverage,
          ratingsQuantity: t.ratingsQuantity,
          price: t.price,
          priceDiscount: t.priceDiscount ?? null,
          summary: t.summary,
          description: t.description,
          imageCover: t.imageCover,
          images: t.images,
          premium: t.premium ?? false,
          hour: t.hour,
          // JSONB preserved exactly as Mongo stored it (geojson style).
          startLocation: t.startLocation ?? undefined,
          // Nested relational writes (Prisma handles the order for us):
          locations: {
            create: (t.locations || []).map((loc) => ({
              description: loc.description,
              address: loc.address,
              day: loc.day,
              // Mongo used [longitude, latitude]; normalize into columns.
              longitude: loc.coordinates ? loc.coordinates[0] : null,
              latitude: loc.coordinates ? loc.coordinates[1] : null,
            })),
          },
          // 1 row per departure date.
          startDates: {
            create: (t.startDates || []).map((d) => ({ startDate: new Date(d) })),
          },
          // M2M: connect by the freshly-created integer user ids.
          guides: {
            connect: (t.guides || []).map((gid) => ({ id: userEmailToId[gid] })),
          },
        },
      });
      tourOldIdToNewId[t._id] = created.id;
    }

    // 3) REVIEWS --------------------------------------------------------
    await tx.review.createMany({
      data: reviews.map((r) => ({
        review: r.review,
        rating: r.rating,
        tourId: tourOldIdToNewId[r.tour], // remap FK targets
        userId: userEmailToId[r.user],
      })),
    });

    console.log(`Imported: ${users.length} users, ${tours.length} tours, ${reviews.length} reviews`);
  });

  await prisma.$disconnect();
  process.exit(0);
};

const deleteData = async () => {
  // Foreign keys are ON DELETE CASCADE from tours/users, so deleting in this
  // order is enough; explicit clears kept for readability.
  await prisma.review.deleteMany();
  await prisma.tour.deleteMany(); // cascades: tour_locations, tour_start_dates, _TourToUser
  await prisma.user.deleteMany();
  console.log("All data deleted successfully");
  await prisma.$disconnect();
  process.exit(0);
};

// CLI flags mirror the old npm scripts.
if (process.argv.includes("--import")) importData();
else if (process.argv.includes("--delete")) deleteData();
else {
  console.log('Usage: node dev-data/data/dev-commands.js --import | --delete');
  process.exit(1);
}