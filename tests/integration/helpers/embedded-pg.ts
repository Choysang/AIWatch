// Boots a real, ephemeral PostgreSQL for integration tests without docker (decision H:
// a real temporary Postgres). Self-hosters run the DB suite this way; in CI (CI=true)
// with DATABASE_URL set, each call instead creates a unique throwaway database on that
// server — the embedded-postgres linux binary needs libicuuc.so.60, which ubuntu-latest
// runners no longer ship.

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";

export interface PgHandle {
  connectionString: string;
  stop: () => Promise<void>;
}

// Random high port per run so a lingering instance from a previous run can't collide.
function randomPort(): number {
  return 50_000 + Math.floor(Math.random() * 10_000);
}

async function runAdminQuery(adminUrl: string, sql: string): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}

// CI path: per-file isolation via a fresh database on the existing pg service, mirroring
// the fresh-cluster isolation the embedded path provides locally.
async function createDatabaseOnServer(adminUrl: string): Promise<PgHandle> {
  const dbName = `aiwatch_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  await runAdminQuery(adminUrl, `CREATE DATABASE "${dbName}"`);

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;

  return {
    connectionString: url.toString(),
    stop: async () => {
      await runAdminQuery(adminUrl, `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    },
  };
}

export async function startEmbeddedPostgres(port = randomPort()): Promise<PgHandle> {
  const externalUrl = process.env.DATABASE_URL;
  if (process.env.CI && externalUrl) {
    return createDatabaseOnServer(externalUrl);
  }

  const dataDir = mkdtempSync(join(tmpdir(), "aiwatch-pg-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "aiwatch",
    password: "aiwatch",
    port,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("aiwatch");

  return {
    connectionString: `postgres://aiwatch:aiwatch@localhost:${port}/aiwatch`,
    stop: async () => {
      await pg.stop();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
