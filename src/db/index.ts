// src/db/index.ts  (factory, so tests can pass ":memory:")
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { relations } from "./relations";

export function createDb(file: string) {
  const sqlite = new Database(file, { create: true });
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA synchronous = NORMAL");
  sqlite.run("PRAGMA busy_timeout = 5000");
  return drizzle({ client: sqlite, relations });
}
export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/**
 * Building-block service methods accept this as their first argument.
 * Both Db and Tx share the exact same Drizzle query/execute/insert/update/delete surface.
 * Omitting transaction-only control methods (`rollback`, `nestedIndex`) makes Db and Tx
 * mutually assignable without requiring call-site narrowing or casting.
 */
export type Conn = Omit<Tx, "rollback" | "nestedIndex">;
