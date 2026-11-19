// src/routes/staff/overview.ts  (prefix /api/v1/properties/:propertyId)
// The "today" screen and the audit trail.
import type { FastifyPluginAsync } from "fastify";
import { AuditLogQuery, parse } from "@neoams/shared";
import { PropertyParams } from "@neoams/shared";
import type { RouteDeps } from "../../http/types";

export const staffOverviewRoutes =
  ({
    services: { overview, oversight },
    guards: { can },
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    /** Arrivals, departures, in-house, housekeeping and proofs awaiting review. */
    app.get("/today", { preHandler: can("booking:read") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      return overview.today(propertyId, new Date());
    });

    /** The audit trail. Owner-level only. */
    app.get("/audit-logs", { preHandler: can("audit:read") }, async (req) => {
      const filter = parse(AuditLogQuery, req.query);
      return oversight.list(filter);
    });
  };
