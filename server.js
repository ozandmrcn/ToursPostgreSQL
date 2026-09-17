// Load environment variables from .env file into process.env
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const app = require("./app.js");

/**
 * DATABASE CONNECTION
 * Connects to PostgreSQL using the URL in .env (DATABASE_URL).
 * Prisma uses a connection pool internally; `$connect()` establishes
 * it lazily but lets us verify the DB is reachable at boot time.
 */
const prisma = new PrismaClient();

prisma
  .$connect()
  .then(() => {
    console.log("PostgreSQL connected successfully ✅");
  })
  .catch((err) => {
    console.log("PostgreSQL connection error: ", err);
  });

/**
 * START SERVER
 * Listens for incoming requests on the specified port.
 */
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}... 🚀`);
});