// better-auth tables (decision 10). One users table for public engagement, experts,
// and the console; `role` carries RBAC. The drizzle adapter resolves columns by these
// JS property names, so they must match better-auth's model fields exactly.
// Re-exported from db/schema.ts so drizzle-kit emits migrations for them.

import { sql } from "drizzle-orm";
import { boolean, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // RBAC role (decision 10): user, expert, moderator, selected_author, admin, owner, readonly_operator.
  role: text("role").notNull().default("user"),
  // Expert domains the user is certified for (spec § Auth and RBAC). Drives weighted likes/stars
  // and comment-quality aggregation. Empty array = user has not been certified in any domain even
  // when role === "expert" — that's a config error surfaced by the console rather than a runtime
  // crash. Domains are free-text strings agreed in the console; matching to event.category is
  // case-insensitive and exact (no fuzzy match in V1).
  expertDomain: text("expert_domain").array().notNull().default(sql`'{}'::text[]`),
  // Multiplier applied to this expert's actions (star, like, comment) before aggregation. 1.0 =
  // a freshly certified expert; admins raise it for high-signal experts. Non-experts keep 1.0
  // but the aggregator only counts their actions when role !== "user" anyway, so this column is
  // a no-op for them. Strong but not absolute (spec: "Expert weight is strong but not absolute").
  expertWeight: real("expert_weight").notNull().default(1.0),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
