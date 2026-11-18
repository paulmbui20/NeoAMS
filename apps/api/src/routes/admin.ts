// apps/api/src/routes/admin.ts
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../http/types";
import { parse } from "@neoams/shared";
import * as s from "superstruct";
import { eq } from "drizzle-orm";

export const adminRoutes =
  ({ services: { db, auth }, guards }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const adminGuard = async (req: any, reply: any) => {
      if (req.user?.role !== "admin") {
        return reply.code(403).send({
          error: { code: "FORBIDDEN", message: "Global admin required" },
        });
      }
    };

    // Properties
    app.get("/properties", { preHandler: adminGuard }, async () => {
      return {
        data: await db.select().from((await import("../db/schema")).properties),
      };
    });

    app.post("/properties", { preHandler: adminGuard }, async (req, reply) => {
      const input = parse(
        s.object({
          name: s.string(),
          slug: s.string(),
          county: s.string(),
          town: s.string(),
          ownerEmail: s.string(),
        }),
        req.body,
      );

      // Logic to create property and assign owner...
      return reply.code(201).send({ message: "Property created" });
    });

    // Users
    app.get("/users", { preHandler: adminGuard }, async (req) => {
      const { q, role } = parse(
        s.type({ q: s.optional(s.string()), role: s.optional(s.string()) }),
        req.query,
      );
      return {
        data: await db.select().from((await import("../db/schema/auth")).user),
      };
    });

    app.post("/users/:id/ban", { preHandler: adminGuard }, async (req) => {
      const { id } = parse(s.object({ id: s.string() }), req.params);
      await db
        .update((await import("../db/schema/auth")).user)
        .set({ banned: true })
        .where(eq((await import("../db/schema/auth")).user.id, id));
      return { success: true };
    });
  };
