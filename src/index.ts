import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./db/schema";

const sqlite = new Database(process.env.DB_FILE_NAME!);

// Enable foreign key enforcement.
sqlite.run("PRAGMA foreign_keys = ON");

// Performance settings.
sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA busy_timeout = 5000");

export const db = drizzle({
  client: sqlite,
  relations: schema.relations,
});

export { sqlite };
