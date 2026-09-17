const p = require("../config/database.js");
(async () => {
  const r = await p.$queryRaw`SELECT DISTINCT EXTRACT(YEAR FROM start_date)::int AS y, COUNT(*) AS c FROM tour_start_dates GROUP BY y ORDER BY y`;
  console.log("start_date years:", JSON.stringify(r, (_, v) => typeof v === "bigint" ? v.toString() : v));
  await p.$disconnect();
})();