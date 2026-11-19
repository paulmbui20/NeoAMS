// src/routes/staff/property.ts  (prefix /api/v1/properties/:propertyId)
import type { FastifyPluginAsync } from "fastify";
import * as s from "superstruct";
import {
  AddStaff,
  ResetPassword,
  UpdatePropertySettings,
  UpdateStaff,
  parse,
  PropertyParams,
  StaffParams,
} from "@neoams/shared";
import type { RouteDeps } from "../../http/types";

export const staffPropertyRoutes =
  ({
    services: { property },
    guards: { can },
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    /** Read the property. */
    app.get("/", { preHandler: can("booking:read") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      return property.get(propertyId);
    });

    /** Edit property settings: times, deposit, contact details. */
    app.patch("/", { preHandler: can("property:manage") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      const patch = parse(UpdatePropertySettings, req.body);
      return property.update(propertyId, patch);
    });

    /* -------------------------------------------------------------- staff */

    app.get("/staff", { preHandler: can("staff:manage") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      return { data: property.listStaff(propertyId) };
    });

    app.post(
      "/staff",
      { preHandler: can("staff:manage") },
      async (req, reply) => {
        const { propertyId } = parse(PropertyParams, req.params);
        const input = parse(AddStaff, req.body);
        const row = await property.addStaff(propertyId, input);
        return reply.code(201).send(row);
      },
    );

    app.patch(
      "/staff/:staffId",
      { preHandler: can("staff:manage") },
      async (req) => {
        const { propertyId, staffId } = parse(StaffParams, req.params);
        const { role } = parse(UpdateStaff, req.body);
        return property.setRole(propertyId, staffId, role, {
          id: req.user.id,
          role: req.user.role,
          isGlobalAdmin: req.user.role === "admin",
        });
      },
    );

    app.delete(
      "/staff/:staffId",
      { preHandler: can("staff:manage") },
      async (req) => {
        const { propertyId, staffId } = parse(StaffParams, req.params);
        return property.removeStaff(propertyId, staffId, {
          id: req.user.id,
          role: req.user.role,
          isGlobalAdmin: req.user.role === "admin",
        });
      },
    );

    app.post(
      "/staff/:staffId/reset-password",
      { preHandler: can("staff:manage") },
      async (req) => {
        const { propertyId, staffId } = parse(StaffParams, req.params);
        const { newPassword } = parse(ResetPassword, req.body);
        return property.resetPassword(propertyId, staffId, newPassword, {
          id: req.user.id,
          role: req.user.role,
          isGlobalAdmin: req.user.role === "admin",
        });
      },
    );
  };
