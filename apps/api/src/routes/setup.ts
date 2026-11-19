// src/routes/setup.ts
// First-run installation. Creates the first global administrator.
// Once done, the system is closed: later calls answer 403 SETUP_COMPLETE.
import type { FastifyPluginAsync } from "fastify";
import * as s from "superstruct";
import { eq } from "drizzle-orm";
import { parse } from "@neoams/shared";
import {
  ForbiddenError,
  isUniqueViolation,
  ValidationError,
} from "../core/errors";
import { appSettings } from "../db/schema";
import type { RouteDeps } from "../http/types";

const SetupInput = s.object({
  name: s.size(s.string(), 1, 100),
  email: s.pattern(s.string(), /^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  password: s.size(s.string(), 10, 100),
  setupToken: s.optional(s.string()),
});

export const setupRoutes =
  ({ services: { auth, db }, env }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    /**
     * The answer never changes after setup, so it is cached. The DB is asked
     * once per process, not once per request.
     */
    let cached: boolean | null = null;
    const needsSetup = async (): Promise<boolean> => {
      if (cached !== null) return cached;
      const row = db.select().from(appSettings).get();
      cached = !row;
      return cached;
    };

    app.get("/setup/status", async () => ({
      needsSetup: await needsSetup(),
      setupTokenRequired: Boolean(env.SETUP_TOKEN),
    }));

    app.post(
      "/setup",
      { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
      async (req, reply) => {
        // Hijack protection: when a token is configured, it must match.
        if (env.SETUP_TOKEN) {
          const body = (req.body ?? {}) as { setupToken?: string };
          if (body.setupToken !== env.SETUP_TOKEN) {
            throw new ValidationError(
              "That setup token is not valid",
              undefined,
              "INVALID_SETUP_TOKEN",
            );
          }
        }

        const input = parse(SetupInput, req.body);

        // Race safety: the primary key on app_settings means only one caller
        // can win. The loser gets a unique-constraint error.
        let claimed = false;
        try {
          db.insert(appSettings)
            .values({ id: 1, setupCompletedAt: Date.now() })
            .run();
          claimed = true;
        } catch (err) {
          // Only a genuine "already claimed" collision means setup is done.
          // Any other failure is a real fault and must not be disguised.
          if (!isUniqueViolation(err)) throw err;
          throw new ForbiddenError(
            "SETUP_COMPLETE",
            "Setup has already been completed",
          );
        }

        try {
          const created = (await auth.api.createUser({
            body: {
              email: input.email,
              password: input.password,
              name: input.name,
              role: "admin",
            },
          } as never)) as unknown as { user: { id: string }; token?: string };

          cached = false;
          return reply.code(201).send({
            user: created.user,
            // The installer is signed in straight away, so the UI can go
            // straight to the admin home without a second round trip.
            token: created.token ?? null,
          });
        } catch (err) {
          // Creating the user failed: release the claim so setup can be retried.
          if (claimed) {
            db.delete(appSettings).where(eq(appSettings.id, 1)).run();
            cached = null;
          }
          throw err;
        }
      },
    );
  };
