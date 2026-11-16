// src/server.ts
import { buildApp } from "./app";
import { createContainer } from "./container";
import { env } from "./env";

const container = createContainer(env);
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
