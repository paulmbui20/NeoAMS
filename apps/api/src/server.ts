// src/server.ts
// Run `bun src/db/seed.ts` to seed sample data for development.
import { buildApp } from "./app";
import { createContainer } from "./container";
import { createDb } from "./db";
import { runMigrations } from "./db/migrate";
import { env } from "./env";

const db = createDb(env.DB_FILE_NAME);

// The schema is brought up to date before anything is served, so a fresh
// install works straight away.
runMigrations(db);

const container = createContainer(env, db);
const app = buildApp(container);

// Tidy expired holds. Availability already ignores them, so this is housekeeping, not correctness.
setInterval(() => {
  try {
    const n = container.services.booking.expireHolds();
    if (n) app.log.info({ expired: n }, "expired booking holds");
  } catch (err) {
    app.log.error(err);
  }
}, 60_000).unref();

for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => void app.close());

await app.listen({ port: env.PORT, host: "0.0.0.0" });
