// src/app.ts
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import scalarApiReference from "@scalar/fastify-api-reference";
import Fastify, { type FastifyRequest } from "fastify";
import type { Container } from "./container";
import type { Actor } from "./core/actor";
import { errorHandler } from "./http/errors";
import { createGuards, type SessionUser } from "./http/guards";
import type { RouteDeps } from "./http/types";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { publicBookingRoutes } from "./routes/public/bookings";
import { staffBillingRoutes } from "./routes/staff/billing";
import { staffBookingRoutes } from "./routes/staff/bookings";
import { staffGuestRoutes } from "./routes/staff/guests";
import { setupRoutes } from "./routes/setup";
import { adminRoutes } from "./routes/admin";

/** Builds the app without listening, so tests can use app.inject(). */
export function buildApp(c: Container) {
  const app = Fastify({
    logger: true,
    trustProxy: c.env.TRUST_PROXY,
    bodyLimit: 256 * 1024,
  });
  const deps: RouteDeps = {
    services: { ...c.services, db: c.db, auth: c.auth },
    guards: createGuards({ auth: c.auth, access: c.services.access }),
  };

  // Fastify 5 requires a getter when the decorated property has a declared type.
  // A getter-only property is read-only, so guards couldn't assign the session user.
  // Back each decoration with a per-request symbol and expose a getter/setter pair.
  const kUser = Symbol("user");
  const kActor = Symbol("actor");
  const store = (req: FastifyRequest) =>
    req as unknown as Record<symbol, unknown>;
  app.decorateRequest("user", {
    getter(this: FastifyRequest) {
      return store(this)[kUser] as SessionUser;
    },
    setter(this: FastifyRequest, value: SessionUser) {
      store(this)[kUser] = value;
    },
  });
  app.decorateRequest("actor", {
    getter(this: FastifyRequest) {
      return store(this)[kActor] as Actor;
    },
    setter(this: FastifyRequest, value: Actor) {
      store(this)[kActor] = value;
    },
  });
  app.setErrorHandler(errorHandler);
  app.addHook("onClose", async () => c.db.$client.close());

  app.addHook("onRequest", async (req, reply) => {
    // Simple CSRF check
    const origin = req.headers.origin;
    if (
      req.method !== "GET" &&
      req.method !== "OPTIONS" &&
      origin &&
      origin !== c.env.FRONTEND_URL
    ) {
      return reply
        .code(403)
        .send({ error: { code: "CSRF_MISMATCH", message: "Invalid origin" } });
    }
  });

  app.register(fastifyCors, {
    origin: c.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    maxAge: 86400,
  });
  app.register(fastifyRateLimit, { max: 300, timeWindow: "1 minute" }); // global ceiling; public routes tighten it

  // API documentation with Swagger & Scalar
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "NeoAMS API Reference",
        description:
          "High-performance accommodation and booking management engine for Bed & Breakfasts and boutique hotels.",
        version: "1.0.0",
      },
      tags: [
        { name: "Auth", description: "Authentication & session management" },
        {
          name: "Me",
          description: "Current authenticated user & guest profile",
        },
        {
          name: "Public",
          description: "Public booking & availability endpoints",
        },
        { name: "Staff Bookings", description: "Property booking management" },
        { name: "Staff Billing", description: "Payments, proofs & invoices" },
        { name: "Staff Guests", description: "Guest directory & desk lookup" },
      ],
    },
  });

  app.register(scalarApiReference, {
    routePrefix: "/reference",
    configuration: {
      theme: "purple",
      layout: "modern",
    },
  });

  app.register(authRoutes(c.auth));
  app.register(setupRoutes(deps));
  app.register(adminRoutes(deps), { prefix: "/api/v1/admin" });
  app.register(publicBookingRoutes(deps), { prefix: "/api/v1/public" });
  app.register(meRoutes(deps), { prefix: "/api/v1" });
  for (const routes of [
    staffBookingRoutes,
    staffBillingRoutes,
    staffGuestRoutes,
  ]) {
    app.register(routes(deps), { prefix: "/api/v1/properties/:propertyId" });
  }
  return app;
}
