# AGENTS.md

## Project Overview

ToursPostgreSQL — Express 5 + Prisma 6 (PostgreSQL). **No MongoDB/Mongoose** — this was a migration project. All code is CommonJS (`"type": "commonjs"` in package.json). Prisma 6.19.3 is pinned (not v7 — v7 generates TypeScript, incompatible with this CJS project).

## Prerequisites

- Docker containers must be running: **PostgreSQL** (password `ozan47400`, port 5432). DB name `tours_db`.
- Node v24 + npm 11.
- Data is seeded into PostgreSQL via `npm run import` (seeds 20 users, 9 tours, 60 reviews).

## Commands

```bash
npm start          # nodemon server.js → http://localhost:4000
npm run migrate    # prisma migrate dev (create/apply migrations)
npm run deploy     # prisma migrate deploy (production)
npm run studio     # prisma studio (DB browser)
npm run import     # node dev-data/data/dev-commands.js --import (seed)
npm run delete     # node dev-data/data/dev-commands.js --delete (wipe data)
```

## Architecture

```
config/database.js     → single PrismaClient singleton (DO NOT instantiate per request)
models/*.js            → MODEL DESCRIPTORS consumed by handlerFactory.js
controllers/handlerFactory.js → generic CRUD (getAll, getOne, createOne, updateOne, deleteOne)
controllers/authController.js   → JWT + bcrypt + cookie auth (all Prisma-based)
controllers/userController.js   → user CRUD + avatar upload (multer + sharp)
controllers/tourController.js   → tour CRUD + stats/monthly/geo via prisma.$queryRaw
controllers/reviewController.js → review CRUD + rating recalc taps
controllers/errorController.js  → Prisma P#### error mapping
utils/apiFeatures.js   → builds Prisma spec {where, orderBy, select, skip, take, include}
utils/parseId.js       → validates req.params.id is an integer (400 otherwise)
middleware/formatQuery.js → req.query → req.formattedQuery (operator $gte→gte, tokens stripped)
utils/sendMail.js      → nodemailer (Mailtrap SMTP) for password-reset emails
utils/filterObjects.js → whitelist filter for request bodies
```

## Model Descriptor Pattern (CRITICAL)

Every model in `models/*.js` exports a descriptor with these keys:

- `modelName` — PascalCase name used in messages.
- `delegate` — `prisma.user`, `prisma.tour`, `prisma.review`.
- `allowFields` — queryable/projectable column names (whitelist for filter/sort/fields). NEVER list `password` etc.
- `defaultSelect` — SELECT projection for reads (omits sensitive columns; `null` → all scalars).
- `defaultScope` — default WHERE (e.g. `{active:true}` for User, `{premium:false}` for Tour).
- `scopeOnGetOne` / `scopeOnWrite` — whether to apply default scope on those operations.
- `listInclude` / `getOneInclude` / `createInclude` — relation includes for list/getOne/create flows.
- `serialize(doc)` — reshapes rows for API (computed fields, embedded-array rebuilds, etc.).
- `beforeCreate(data)` / `beforeUpdate(data)` — validation + computed fields + nested relation mapping. Return modified data.
- Static helpers: `findByEmail`, `findById`, `createResetToken` (User), `calcAverageRatings` (Review).

## Key Prisma Gotchas

1. **`select` + `include` conflict** — Prisma forbids mixing them. `readOptions()` in handlerFactory picks one per model. If you add a `?fields=` (select) to a route that also has include, include is dropped in `handlerFactory.js` `getAll`.
2. **`findUnique` only accepts unique fields** — protect middleware uses `findFirst({where:{id,active}})` (NOT `findUnique`).
3. **Column naming** — Most Tour scalar columns are camelCase in DB (no `@map`); `users.created_at`, `tour_locations.tour_id`, `tour_start_dates.start_date`, `reviews.tour_id`/`user_id` are snake_case via `@map`. Raw SQL in `$queryRaw` must use actual DB column names — double-quote camelCase identifiers (`"ratingsAverage"`, `"startLocation"`).
4. **`$queryRaw` tagged templates** — Prisma interpolates `${...}` as parameterized values (safe). Column/table names must be literal in the template string. Use `::int` / `::float8` casts to avoid Decimal/BigInt wrappers.
5. **No soft-delete in Postgres** — delete is hard delete.
6. **PostgreSQL has no PostGIS** — geospatial queries (tours-within, distances) use the Haversine formula expanded inline in SQL, reading coordinates from the JSONB `startLocation` column: `(t."startLocation" -> 'coordinates' -> 0)::float8` is longitude, `-> 1` is latitude.

## Route Wiring

Routes: `routes/tourRoutes.js`, `routes/userRoutes.js`, `routes/reviewRoutes.js`.
- Nested reviews at `/api/tours/:tourId/reviews` (mergeParams=true in reviewRouter).
- FormatQuery middleware (`formatQuery`) must sit before factory handlers that need `req.formattedQuery` (tour list, alias top-tours, review list, user list).
- All tour CRUD except alias-top uses formatQuery at GET `/`.

## Auth

- JWT in `jwt` HTTP-only cookie (also accepts `Authorization: Bearer` header).
- Admin credentials (seeded): **admin@natours.io / test1234**.
- `.env` requires: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_COOKIE_EXPIRES_IN`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `PORT=4000`, `NODE_ENV=development`.
- `passChangedAt` compares token `iat` (seconds) against `new Date(passChangedAt).getTime()/1000`.

## Image Upload

- `uploadUserPhoto` (multer memory storage, field name: `avatar`, image filter only) + `resizeUserPhoto` (sharp → 500×500 webp quality 70, file `user-{id}-{timestamp}.webp`, written to `public/img/users/`).
- `public/img/users/` must exist.

## Testing / Verification

No test suite. Verify manually with curl/Postman:
- `GET /api/tours` → success:true, results:9
- `POST /api/users/login {email, password}` → token in cookie + body.
- `GET /api/tours/tour-stats` (admin token) → grouped stats.
- `GET /api/tours/monthly-plan/2026` — check actual `start_date` years first via Prisma Studio.
- `GET /api/tours/tours-within/:dist/center/:lat,lng/unit/mi`
- `GET /api/tours/distances/:lat,lng/unit/mi`
- `GET /api/tours/top-tours` (protected) → limit 5.

## Notes

- Response envelope: `{success, message?, results?, data}`; delete returns 204 with `data:null`.
- HPP (HTTP Parameter Pollution) middleware in `app.js` is DB-agnostic; kept for query safety. SQL injection is impossible via Prisma (parameterized).
- `npm approve-scripts` warnings for bcrypt/sharp/@prisma/client postinstall are informational; runtime is unaffected.
