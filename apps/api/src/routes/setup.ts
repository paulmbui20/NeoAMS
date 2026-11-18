// apps/api/src/routes/setup.ts
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../http/types";
import { parse } from "@neoams/shared";
import * as s from "superstruct";
import { UnauthorizedError } from "../core/errors";

const SetupInput = s.object({
  name: s.size(s.string(), 1, 100),
  email: s.pattern(s.string(), /^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  password: s.size(s.string(), 10, 100),
  setupToken: s.optional(s.string()),
});

export const setupRoutes =
  ({ services: { auth, db }, guards }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    // Simple in-memory cache for setup status
    let cachedNeedsSetup: boolean | null = null;

    app.get("/setup/status", async () => {
      if (cachedNeedsSetup !== null) return { needsSetup: !cachedNeedsSetup };

      const settings = await db
        .select()
        .from((await import("../db/schema")).appSettings)
        .get();

      cachedNeedsSetup = !!settings;
      return { needsSetup: !cachedNeedsSetup };
    });

    app.post("/setup", async (req, reply) => {
      const input = parse(SetupInput, req.body);

      // Hijack protection: check token if configured in env
      if (
        process.env.SETUP_TOKEN &&
        input.setupToken !== process.env.SETUP_TOKEN
      ) {
        return reply.code(403).send({
          error: { code: "INVALID_TOKEN", message: "Invalid setup token" },
        });
      }

      try {
        // Race safety: try to insert the settings row first
        await db
          .insert((await import("../db/schema")).appSettings)
          .values({
            id: 1,
            setupCompletedAt: Date.now(),
          })
          .run();
      } catch (e) {
        return reply.code(403).send({
          error: {
            code: "SETUP_COMPLETE",
            message: "Setup already completed",
          },
        });
      }

      // Create the first admin user
      // This uses the Better Auth admin plugin logic conceptually
      // Since we are in the API, we call the auth service's internal create
      const admin = await auth.api.createUser({
        body: {
          email: input.email,
          password: input.password,
          name: input.name,
          role: "admin",
        },
      });

      cachedNeedsSetup = true;
      return reply.code(201).send(admin);
    });
  };
