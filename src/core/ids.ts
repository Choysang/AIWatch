// Prefixed ULID identifiers stored as text. k-sortable, URL-safe, debuggable:
// the value in the DB is the value in the URL/API (e.g. "evt_01jabc...").

import { ulid } from "ulid";

export type IdPrefix = "src" | "post" | "evt" | "ej" | "es" | "usr" | "rpt" | "con" | "aud" | "rx" | "cmt" | "spd";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid().toLowerCase()}`;
}
