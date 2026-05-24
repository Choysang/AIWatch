// Boots a real, ephemeral PostgreSQL for integration tests without docker (decision H:
// a real temporary Postgres). Self-hosters and CI without a pg service can run the DB
// suite this way; CI may instead point DATABASE_URL at a managed pg service.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

export interface PgHandle {
  connectionString: string;
  stop: () => Promise<void>;
}

// Random high port per run so a lingering instance from a previous run can't collide.
function randomPort(): number {
  return 50_000 + Math.floor(Math.random() * 10_000);
}

export async function startEmbeddedPostgres(port = randomPort()): Promise<PgHandle> {
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
