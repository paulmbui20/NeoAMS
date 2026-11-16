// src/routes/public/bookings.ts: prefix /api/v1/public (no auth, slugs, rate limited)
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../../http/types";
import { SubmitProof } from "../../validation/billing";
import {
  AvailabilityQuery,
  CreateOnlineBooking,
  GuestCancelByPhone,
  GuestLookup,
} from "../../validation/booking";
import { parse, ReferenceParams, SlugParams } from "../../validation/common";

export const publicBookingRoutes =
  ({
    services: { booking, availability },
    guards,
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const strict = { rateLimit: { max: 10, timeWindow: "1 minute" } }; // brute-force and spam guard

    app.get("/properties/:slug/availability", async (req) => {
      const { slug } = parse(SlugParams, req.params);
      return {
        data: availability.searchBySlug(
          slug,
          parse(AvailabilityQuery, req.query),
        ),
      };
    });

    app.post(
      "/properties/:slug/bookings",
      { config: strict },
      async (req, reply) => {
        const { slug } = parse(SlugParams, req.params);
        const input = parse(CreateOnlineBooking, req.body);
        return reply
          .code(201)
          .send(
            booking.createOnline(slug, input, await guards.optionalActor(req)),
          );
      },
    );

    // POST, not GET: the phone number stays out of URLs and logs
    app.post("/bookings/lookup", { config: strict }, async (req) => {
      const { reference, phone } = parse(GuestLookup, req.body);
      return booking.viewAsGuest({ reference, phone });
    });

    app.post("/bookings/:reference/cancel", { config: strict }, async (req) => {
      const { reference } = parse(ReferenceParams, req.params);
      const { phone, reason } = parse(GuestCancelByPhone, req.body);
      return booking.cancelAsGuest(
        { reference, phone },
        reason,
        await guards.optionalActor(req),
      );
    });

    app.post(
      "/bookings/:reference/payments",
      { config: strict },
      async (req, reply) => {
        const { reference } = parse(ReferenceParams, req.params);
        const { phone, ...proof } = parse(SubmitProof, req.body);
        return reply
          .code(201)
          .send(
            booking.submitProof(
              { reference, phone },
              proof,
              await guards.optionalActor(req),
            ),
          );
      },
    );
  };
