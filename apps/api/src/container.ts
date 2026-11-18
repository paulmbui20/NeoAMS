// src/container.ts  (the only place that wires things together)
import { createAuth } from "./auth";
import { systemClock } from "./core/clock";
import { createDb, type Db } from "./db";
import type { Env } from "./env";
import { createAccessService } from "./services/access";
import { createAuditService } from "./services/audit";
import { createAvailabilityService } from "./services/availability";
import { createBillingService } from "./services/billing";
import { createBookingService } from "./services/booking";
import { createGuestService } from "./services/guest";

export function createContainer(
  env: Env,
  db: Db = createDb(env.DB_FILE_NAME),
  clock = systemClock,
) {
  const audit = createAuditService();
  const access = createAccessService({ db });
  const availability = createAvailabilityService({ db, clock });
  const guest = createGuestService({ db });
  const billing = createBillingService({ db, audit });
  const booking = createBookingService({
    db,
    clock,
    audit,
    availability,
    guest,
    billing,
    config: {
      holdMinutes: env.BOOKING_HOLD_MINUTES,
      proofHoldHours: env.PROOF_HOLD_HOURS,
    },
  });
  return {
    env,
    db,
    auth: createAuth(db, env),
    services: { access, audit, availability, guest, billing, booking },
  };
}
export type Container = ReturnType<typeof createContainer>;
export type Services = Container["services"];
