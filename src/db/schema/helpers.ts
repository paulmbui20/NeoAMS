import { sql } from "drizzle-orm";
import { integer } from "drizzle-orm/sqlite-core";

// Needs SQLite >= 3.42 (unixepoch('subsecond')). Bun's bundled SQLite is fine.
export const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs);

export const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(nowMs)
    .$onUpdate(() => new Date());

/** Spread into a table: `...timestamps()` */
export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
