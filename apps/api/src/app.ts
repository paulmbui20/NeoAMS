// src/app.ts
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
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
import { adminRoutes } from "./routes/admin";
import { setupRoutes } from "./routes/setup";
import { uploadRoutes } from "./routes/uploads";
import { publicBookingRoutes } from "./routes/public/bookings";
import { staffBillingRoutes } from "./routes/staff/billing";
import { staffBookingRoutes } from "./routes/staff/bookings";
import { staffCatalogRoutes } from "./routes/staff/catalog";
import { staffFinanceRoutes } from "./routes/staff/finance";
import { staffGuestRoutes } from "./routes/staff/guests";
import { staffImageRoutes } from "./routes/staff/images";
import { staffOverviewRoutes } from "./routes/staff/overview";
import { staffPropertyRoutes } from "./routes/staff/property";

/** Builds the app without listening, so tests can use app.inject(). */
export function buildApp(c: Container) {
  const app = Fastify({
    logger: true,
    trustProxy: c.env.TRUST_PROXY,
    bodyLimit: 256 * 1024,
  });
  const deps: RouteDeps = {
    services: { ...c.services, db: c.db, auth: c.auth, storage: c.storage },
    guards: createGuards({ auth: c.auth, access: c.services.access }),
    env: c.env,
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

  // Defence in depth on top of SameSite=Lax cookies: a cross-site write
  // with an unexpected Origin is refused before it reaches a handler.
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (
      req.method !== "GET" &&
      req.method !== "OPTIONS" &&
      origin &&
      origin !== c.env.FRONTEND_URL
    ) {
      return reply.code(403).send({
        error: {
          code: "CSRF_MISMATCH",
          message: "Invalid origin",
          requestId: req.id,
        },
      });
    }
  });

  app.register(fastifyCors, {
    origin: c.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    maxAge: 86400,
  });
  // The ceiling for the whole API. A dashboard page makes a handful of
  // calls, and a shared office sits behind one address, so the limit is
  // generous; the public endpoints tighten it themselves.
  app.register(fastifyRateLimit, { max: 600, timeWindow: "1 minute" });
  app.register(fastifyMultipart, {
    limits: { fileSize: c.env.MAX_UPLOAD_BYTES, files: 1 },
  });

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
        { name: "Setup", description: "First-run installation" },
        { name: "Admin", description: "System administration" },
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
        { name: "Staff Property", description: "Property settings & staff" },
        { name: "Staff Catalog", description: "Rooms, room types & services" },
        { name: "Staff Finance", description: "Expenses & reports" },
        { name: "Staff Overview", description: "Today view & audit trail" },
        { name: "Uploads", description: "Image upload and delivery" },
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
  app.register(setupRoutes(deps), { prefix: "/api/v1" });
  app.register(adminRoutes(deps), { prefix: "/api/v1/admin" });
  app.register(uploadRoutes(deps), { prefix: "/api/v1" });
  app.register(publicBookingRoutes(deps), { prefix: "/api/v1/public" });
  app.register(meRoutes(deps), { prefix: "/api/v1" });
  for (const routes of [
    staffBookingRoutes,
    staffBillingRoutes,
    staffGuestRoutes,
    staffPropertyRoutes,
    staffCatalogRoutes,
    staffFinanceRoutes,
    staffOverviewRoutes,
    staffImageRoutes,
  ]) {
    app.register(routes(deps), { prefix: "/api/v1/properties/:propertyId" });
  }
  return app;
}
