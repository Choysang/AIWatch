// Shared Drizzle client (node-postgres). Imported by the worker and by web server code.
// Lazy: importing this module never connects or throws — the pool is created on first
// use, reading DATABASE_URL then (fail fast). This keeps `next build` working without a
// live DB and lets tests set DATABASE_URL before the first query.

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** The transaction handle passed to `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

let realPool: pg.Pool | null = null;
let realDb: DB | null = null;

function init(): DB {
  if (!realDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    realPool = new pg.Pool({ connectionString });
    realDb = drizzle(realPool, { schema, casing: "snake_case" });
  }
  return realDb;
}

export function getDb(): DB {
  return init();
}

export function getPool(): pg.Pool {
  init();
  return realPool!;
}

// Closes the pool and clears the singleton so a later getDb() re-reads DATABASE_URL.
// Used by integration tests that swap databases between files in one process.
export async function resetDb(): Promise<void> {
  // Clear the singleton first so a later getDb() re-inits even if the close below is slow.
  const pool = realPool;
  realPool = null;
  realDb = null;
  if (pool) await pool.end();
}

// Lazy proxies preserve the `db` / `pool` import API used across the codebase while
// deferring connection until the first property access. Methods are bound to the real
// instance so Drizzle's internal `this` stays correct.
function lazy<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const real = get();
      const value = Reflect.get(real as object, prop, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
  });
}

export const db: DB = lazy(getDb);
export const pool: pg.Pool = lazy(getPool);
