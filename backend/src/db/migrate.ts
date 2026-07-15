import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./postgres.js";

async function main() {
  console.log("[db] enabling pgvector extension...");
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");

  console.log("[db] running migrations...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });

  console.log("[db] done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[db] migration failed:", err);
  process.exit(1);
});
