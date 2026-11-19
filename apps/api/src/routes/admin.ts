// src/routes/admin.ts  (prefix /api/v1/admin, global admin only)
import type { FastifyPluginAsync } from "fastify";
import * as s from "superstruct";
import {
  AdminUserQuery,
  BanUser,
  CreateAdminUser,
  CreateProperty,
  PageQuery,
  ResetPassword,
  SingleIdParams,
  UpdateAdminUser,
  UpdateProperty,
  parse,
} from "@neoams/shared";
import { ForbiddenError } from "../core/errors";
import type { RouteDeps } from "../http/types";

export const adminRoutes =
  ({ services: { admin, users }, guards }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    /**
     * Global admin only. `requireUser` runs first so the session is resolved,
     * then the role is checked. Nothing below this point trusts the client.
     */
    const requireAdmin = async (req: any, reply: any) => {
      await guards.requireUser(req);
      if (req.user?.role !== "admin") {
        throw new ForbiddenError(
          "ADMIN_REQUIRED",
          "This area is for system administrators",
        );
      }
    };

    /* --------------------------------------------------------- properties */

    app.get("/properties", { preHandler: requireAdmin }, async (req) => {
      const { limit, offset } = parse(PageQuery, req.query);
      return admin.listProperties({ limit, offset });
    });

    app.post(
      "/properties",
      { preHandler: requireAdmin },
      async (req, reply) => {
        const input = parse(CreateProperty, req.body);
        const property = await admin.createProperty(input);
        return reply.code(201).send(property);
      },
    );

    app.get("/properties/:id", { preHandler: requireAdmin }, async (req) => {
      const { id } = parse(SingleIdParams, req.params);
      return admin.getProperty(id);
    });

    app.patch("/properties/:id", { preHandler: requireAdmin }, async (req) => {
      const { id } = parse(SingleIdParams, req.params);
      const patch = parse(UpdateProperty, req.body);
      return admin.updateProperty(id, patch);
    });

    /* -------------------------------------------------------------- users */

    app.get("/users", { preHandler: requireAdmin }, async (req) => {
      const query = parse(AdminUserQuery, req.query);
      return users.list(query);
    });

    app.post("/users", { preHandler: requireAdmin }, async (req, reply) => {
      const input = parse(CreateAdminUser, req.body);
      const created = await admin.createUser(
        {
          ...input,
          tempPassword: input.tempPassword,
          mustChangePassword: input.mustChangePassword ?? true,
        },
        req.user.role,
      );
      return reply.code(201).send(created);
    });

    app.get("/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
      const { id } = parse(s.object({ id: s.string() }), req.params);
      const found = users.findById(id);
      if (!found) {
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "User not found" } });
      }
      return found;
    });

    app.patch("/users/:id", { preHandler: requireAdmin }, async (req) => {
      const { id } = parse(s.object({ id: s.string() }), req.params);
      const patch = parse(UpdateAdminUser, req.body);
      let current = users.findById(id);
      if (patch.name !== undefined) {
        current = users.setName(id, patch.name);
      }
      if (patch.role !== undefined) {
        current = admin.setUserRole(id, patch.role, req.user.id, req.user.role);
      }
      return current;
    });

    app.post("/users/:id/ban", { preHandler: requireAdmin }, async (req) => {
      const { id } = parse(s.object({ id: s.string() }), req.params);
      const { reason } = parse(BanUser, req.body ?? {});
      return admin.banUser(id, reason, req.user.id, req.user.role);
    });

    app.post("/users/:id/unban", { preHandler: requireAdmin }, async (req) => {
      const { id } = parse(s.object({ id: s.string() }), req.params);
      return admin.unbanUser(id, req.user.id, req.user.role);
    });

    app.post(
      "/users/:id/reset-password",
      { preHandler: requireAdmin },
      async (req) => {
        const { id } = parse(s.object({ id: s.string() }), req.params);
        const { newPassword } = parse(ResetPassword, req.body);
        return admin.resetPassword(id, newPassword, req.user.id, req.user.role);
      },
    );

    app.post(
      "/users/:id/revoke-sessions",
      { preHandler: requireAdmin },
      async (req) => {
        const { id } = parse(s.object({ id: s.string() }), req.params);
        return admin.revokeSessions(id, req.user.id, req.user.role);
      },
    );
  };
