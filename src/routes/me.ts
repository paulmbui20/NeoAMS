// src/routes/me.ts: prefix /api/v1 (any signed-in user)
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../http/types";
import { SubmitProofAsUser } from "../validation/billing";
import { GuestCancel, MyBookingsQuery } from "../validation/booking";
import { parse, ReferenceParams } from "../validation/common";
import { GuestProfile } from "../validation/guest";

export const meRoutes =
  ({
    services: { access, booking, guest },
    guards,
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const auth = { preHandler: guards.requireUser };
    const mine = (req: { user: { id: string } }, reference: string) => ({
      reference,
      userId: req.user.id,
    });

    app.get("/me", auth, async (req) => ({
      user: req.user,
      properties: access.propertiesFor(req.user.id), // where I work, and as what
      guest: guest.profileFor(req.user.id),
    }));

    app.get("/me/guest", auth, async (req) => guest.profileFor(req.user.id));
    app.put("/me/guest", auth, async (req) =>
      guest.upsertForUser(req.user.id, parse(GuestProfile, req.body)),
    );

    app.get("/me/bookings", auth, async (req) =>
      booking.listForUser(req.user.id, parse(MyBookingsQuery, req.query)),
    );

    app.get("/me/bookings/:reference", auth, async (req) =>
      booking.viewAsGuest(
        mine(req, parse(ReferenceParams, req.params).reference),
      ),
    );

    app.post("/me/bookings/:reference/cancel", auth, async (req) => {
      const { reason } = parse(GuestCancel, req.body ?? {});
      return booking.cancelAsGuest(
        mine(req, parse(ReferenceParams, req.params).reference),
        reason,
        req.actor,
      );
    });

    app.post("/me/bookings/:reference/payments", auth, async (req, reply) => {
      const proof = parse(SubmitProofAsUser, req.body);
      return reply
        .code(201)
        .send(
          booking.submitProof(
            mine(req, parse(ReferenceParams, req.params).reference),
            proof,
            req.actor,
          ),
        );
    });
  };
