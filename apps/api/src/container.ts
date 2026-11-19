// src/container.ts  (the only place that wires things together)
import { createAuth } from "./auth";
import { systemClock } from "./core/clock";
import { LocalStorage } from "./core/storage";
import { createDb, type Db } from "./db";
import type { Env } from "./env";
import { createAccessService } from "./services/access";
import { createAdminService } from "./services/admin";
import { createAuditService } from "./services/audit";
import { createAvailabilityService } from "./services/availability";
import { createBillingService } from "./services/billing";
import { createBookingService } from "./services/booking";
import { createCatalogService } from "./services/catalog";
import { createFinanceService } from "./services/finance";
import { createGuestService } from "./services/guest";
import { createOverviewService } from "./services/overview";
import { createOversightService } from "./services/oversight";
import { createPropertyService } from "./services/property";
import { createUsersService } from "./services/users";

export function createContainer(
  env: Env,
  db: Db = createDb(env.DB_FILE_NAME),
  clock = systemClock,
) {
  const audit = createAuditService();
  const access = createAccessService({ db });
  const auth = createAuth(db, env);
  const storage = new LocalStorage(env.UPLOAD_DIR);
  const users = createUsersService({ db, auth });
  const admin = createAdminService({ db, users });
  const property = createPropertyService({ db, users });
  const catalog = createCatalogService({ db });
  const finance = createFinanceService({ db });
  const overview = createOverviewService({ db });
  const oversight = createOversightService({ db });
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
    auth,
    storage,
    services: {
      access,
      admin,
      audit,
      availability,
      billing,
      booking,
      catalog,
      finance,
      guest,
      overview,
      oversight,
      property,
      users,
    },
  };
}
export type Container = ReturnType<typeof createContainer>;
export type Services = Container["services"];
