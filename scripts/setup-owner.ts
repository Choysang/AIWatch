// `bun run setup:owner` (a.k.a. db:seed:empty-owner) — bootstrap the owner account
// (decision 10: no hardcoded admin). Credentials come from env or argv, never the repo.
// Creates the user through better-auth (correct password hashing), then elevates to owner.

import { eq } from "drizzle-orm";
import { auth } from "@/auth/auth";
import { user } from "@/db/auth-schema";
import { db, pool } from "@/db/client";

async function main(): Promise<void> {
  const email = process.env.OWNER_EMAIL ?? process.argv[2];
  const password = process.env.OWNER_PASSWORD ?? process.argv[3];
  const name = process.env.OWNER_NAME ?? "Owner";

  if (!email || !password) {
    // eslint-disable-next-line no-console -- usage
    console.error(
      "Usage: OWNER_EMAIL=you@example.com OWNER_PASSWORD=secret bun run setup:owner",
    );
    process.exit(1);
  }

  try {
    await auth.api.signUpEmail({ body: { email, password, name } });
    // eslint-disable-next-line no-console -- script output
    console.log(`[owner] account created: ${email}`);
  } catch (error) {
    // Likely already exists; we still (re)assert the owner role below.
    // eslint-disable-next-line no-console -- script output
    console.log(`[owner] sign-up skipped (may already exist): ${(error as Error).message}`);
  }

  await db.update(user).set({ role: "owner" }).where(eq(user.email, email));
  // eslint-disable-next-line no-console -- script output
  console.log(`[owner] role set to owner for ${email}`);
  await pool.end();
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- fatal
  console.error("[owner] failed:", error);
  process.exit(1);
});
