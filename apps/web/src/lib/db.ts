import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@transport/db/schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * One postgres pool per process, created on first use.
 * Lazy so that importing this module during the build does not need a database.
 * Cached on globalThis because dev reloads re-evaluate modules.
 */
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres>; __db?: Database };

function getDb(): Database {
  if (!globalForDb.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__sql ??= postgres(url, { max: 10 });
    globalForDb.__db = drizzle(globalForDb.__sql, { schema });
  }
  return globalForDb.__db;
}

export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});

export { schema };
