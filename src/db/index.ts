import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { env } from "../env";
import { relations } from "./relations";

const sqlite = new Database(env.DB_FILE_NAME, { create: true });

sqlite.run("PRAGMA foreign_keys = ON"); // per-connection, keep it
sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA synchronous = NORMAL"); // safe with WAL, noticeably faster
sqlite.run("PRAGMA busy_timeout = 5000");

export const db = drizzle({ client: sqlite, relations });
export { sqlite };
