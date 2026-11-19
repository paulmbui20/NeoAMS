// src/db/migrate.ts
// Applies the pending migrations before the server accepts a request.
// A fresh install therefore has its schema, without a separate step.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { Db } from "./index";

/**
 * Where the migration folders live.
 * `import.meta.dir` is `src/db`, so the default is `<app>/drizzle`.
 * It can be overridden for unusual layouts.
 */
export function migrationsFolder(): string {
  const fromEnv = process.env.MIGRATIONS_FOLDER;
  if (fromEnv) return resolve(fromEnv);
  const beside = join(dirname(import.meta.dir), "..", "drizzle");
  if (existsSync(beside)) return beside;
  const fromCwd = join(process.cwd(), "drizzle");
  if (existsSync(fromCwd)) return fromCwd;
  return beside;
}

/**
 * Bring the database up to date. Safe to call on every start: migrations
 * that have already run are skipped.
 */
export function runMigrations(db: Db, folder = migrationsFolder()): void {
  if (!existsSync(folder)) {
    throw new Error(
      `The migrations folder is missing (looked in ${folder}). The API cannot start without its schema.`,
    );
  }
  migrate(db, { migrationsFolder: folder });
}
