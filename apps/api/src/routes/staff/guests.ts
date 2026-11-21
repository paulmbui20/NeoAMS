// src/routes/staff/guests.ts
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../../http/types";
import { IdParams, parse } from "@neoams/shared";
import { DeskGuest, GuestSearchQuery } from "@neoams/shared";

export const staffGuestRoutes =
  ({ services: { guest }, guards: { can } }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/guests", { preHandler: can("guest:read") }, async (req) => {
      const { q, ...page } = parse(GuestSearchQuery, req.query);
      // Without a term the whole list of the property is shown.
      return guest.search(q ?? "", page);
    });

    // find-or-create: 200 if the guest already existed, 201 if new
    app.post(
      "/guests",
      { preHandler: can("guest:write") },
      async (req, reply) => {
        const { id, created } = guest.findOrCreateOne(
          parse(DeskGuest, req.body),
        );
        return reply.code(created ? 201 : 200).send(guest.get(id));
      },
    );

    app.get("/guests/:id", { preHandler: can("guest:read") }, async (req) =>
      guest.get(parse(IdParams, req.params).id),
    );

    app.patch(
      "/guests/:id",
      { preHandler: can("guest:write") },
      async (req) => {
        const { id } = parse(IdParams, req.params);
        return guest.update(id, req.body as never);
      },
    );
  };
