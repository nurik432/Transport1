import "dotenv/config";
import postgres from "postgres";

// Drops the public schema and recreates it. Development only.
const url = process.env.DATABASE_URL ?? "postgres://transport:transport@localhost:5433/transport";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("refusing to reset production database");
  const sql = postgres(url, { max: 1 });
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
  await sql.end();
  console.log("database reset");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
