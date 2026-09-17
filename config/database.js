// ===================================================================
//  @file config/database.js
//  @description Shared Prisma client (PostgreSQL connection pool).
//
//  MongoDB era: every model imported `mongoose` and used its models.
//  Prisma era: ONE PrismaClient instance is created per process and
//  shared by every model file. Prisma talks to PostgreSQL using the
//  URL in `DATABASE_URL` (see .env) and a connection pool, so we must
//  never call `new PrismaClient()` per request or per model (that would
//  exhaust connections).
// ===================================================================

const { PrismaClient } = require("@prisma/client");

module.exports = new PrismaClient();