// src/routes/me.ts: prefix /api/v1 (any signed-in user)
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../http/types";
import { SubmitProofAsUser } from "@neoams/shared";
import { GuestCancel, MyBookingsQuery } from "@neoams/shared";
import { parse, ReferenceParams } from "@neoams/shared";
import { GuestProfile } from "@neoams/shared";
import * as s from "superstruct";
import { eq } from "drizzle-orm";
import { user } from "../db/schema/auth";

export const meRoutes =
  ({
    services: { access, booking, guest, db, auth },
    guards,
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const authGuard = { preHandler: guards.requireUser };
    const mine = (req: { user: { id: string } }, reference: string) => ({
      reference,
      userId: req.user.id,
    });

    app.get("/me", authGuard, async (req) => ({
      user: req.user,
      properties: access.propertiesFor(req.user.id),
      guest: guest.profileFor(req.user.id),
    }));

    app.post("/me/password", authGuard, async (req, reply) => {
      const { currentPassword, newPassword } = parse(
        s.object({
          currentPassword: s.size(s.string(), 10, 100),
          newPassword: s.size(s.string(), 10, 100),
        }),
        req.body,
      );

      await auth.api.changePassword({
        body: {
          currentPassword,
          newPassword,
        },
        userId: req.user.id,
      });

      await db
        .update(user)
        .set({ mustChangePassword: false })
        .where(eq(user.id, req.user.id));

      return reply.send({ message: "Password updated successfully" });
    });

    app.get("/me/guest", authGuard, async (req) =>
      guest.profileFor(req.user.id),
    );
    app.put("/me/guest", authGuard, async (req) =>
      guest.upsertForUser(req.user.id, parse(GuestProfile, req.body)),
    );

    app.get("/me/bookings", authGuard, async (req) =>
      booking.listForUser(req.user.id, parse(MyBookingsQuery, req.query)),
    );

    app.get("/me/bookings/:reference", authGuard, async (req) =>
      booking.viewAsGuest(
        mine(req, parse(ReferenceParams, req.params).reference),
      ),
    );

    app.post("/me/bookings/:reference/cancel", authGuard, async (req) => {
      const { reason } = parse(GuestCancel, req.body ?? {});
      return booking.cancelAsGuest(
        mine(req, parse(ReferenceParams, req.params).reference),
        reason,
        req.actor,
      );
    });

    app.post(
      "/me/bookings/:reference/payments",
      authGuard,
      async (req, reply) => {
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
      },
    );
  };
