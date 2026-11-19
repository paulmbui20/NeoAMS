// src/routes/me.ts: prefix /api/v1 (any signed-in user)
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../http/types";
import { SubmitProofAsUser } from "@neoams/shared";
import { GuestCancel, MyBookingsQuery } from "@neoams/shared";
import { parse, ReferenceParams } from "@neoams/shared";
import { GuestProfile } from "@neoams/shared";
import * as s from "superstruct";
import { eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
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
      mustChangePassword: req.user.mustChangePassword ?? false,
    }));

    app.post("/me/password", authGuard, async (req, reply) => {
      const { currentPassword, newPassword } = parse(
        s.object({
          currentPassword: s.size(s.string(), 10, 100),
          newPassword: s.size(s.string(), 10, 100),
        }),
        req.body,
      );

      // Changing the password closes every session, the one making the
      // request included, and opens a fresh one. The browser has to be
      // given that new session, or it is left holding a cookie for a
      // session that no longer exists.
      const response = await auth.api.changePassword({
        body: {
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        },
        headers: fromNodeHeaders(req.headers),
        asResponse: true,
      });

      // With `asResponse` the refusal comes back as a response rather than
      // as a thrown error, so it has to be read here.
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          code?: string;
          message?: string;
        } | null;
        const failure = new Error(
          body?.message ?? "The password could not be changed",
        ) as Error & { statusCode?: number; code?: string };
        failure.statusCode = response.status;
        failure.code = body?.code ?? "PASSWORD_CHANGE_FAILED";
        throw failure;
      }

      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);

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
