/**
 * Starts an embedded PostgreSQL instance on port 5432 for local development.
 * Data is persisted in .pg-data/ so it survives restarts.
 * Run this in a dedicated terminal before starting `bun run dev`.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dir, "..", ".pg-data");
const PORT = 5432;
const isNew = !existsSync(join(DATA_DIR, "PG_VERSION"));

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "aiwatch",
  password: "aiwatch",
  port: PORT,
  persistent: true,
});

if (isNew) {
  console.log("Initialising new PostgreSQL data directory...");
  await pg.initialise();
}

console.log(`Starting PostgreSQL on port ${PORT}...`);
await pg.start();

if (isNew) {
  await pg.createDatabase("aiwatch");
  console.log("Created database 'aiwatch'.");
}

console.log(`PostgreSQL ready: postgres://aiwatch:aiwatch@localhost:${PORT}/aiwatch`);
console.log("Press Ctrl+C to stop.\n");

process.on("SIGINT", async () => {
  console.log("\nStopping PostgreSQL...");
  await pg.stop();
  process.exit(0);
});

// Keep alive
await new Promise<never>(() => {});
