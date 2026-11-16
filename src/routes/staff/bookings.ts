// src/routes/staff/bookings.ts: prefix /api/v1/properties/:propertyId
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../../http/types";
import {
  BookingListQuery,
  CreateDeskBooking,
  DeskAvailabilityQuery,
  StaffCancel,
} from "../../validation/booking";
import { IdParams, parse, PropertyParams } from "../../validation/common";

export const staffBookingRoutes =
  ({
    services: { booking, availability },
    guards: { can },
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get(
      "/availability",
      { preHandler: can("booking:read") },
      async (req) => {
        const { propertyId } = parse(PropertyParams, req.params);
        return {
          data: availability.listFreeRooms(
            propertyId,
            parse(DeskAvailabilityQuery, req.query),
          ),
        };
      },
    );

    app.get("/bookings", { preHandler: can("booking:read") }, async (req) =>
      booking.list(
        parse(PropertyParams, req.params).propertyId,
        parse(BookingListQuery, req.query),
      ),
    );

    app.post(
      "/bookings",
      { preHandler: can("booking:write") },
      async (req, reply) => {
        const { propertyId } = parse(PropertyParams, req.params);
        return reply
          .code(201)
          .send(
            booking.createFromDesk(
              propertyId,
              parse(CreateDeskBooking, req.body),
              req.actor,
            ),
          );
      },
    );

    app.get(
      "/bookings/:id",
      { preHandler: can("booking:read") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        return booking.get(propertyId, id);
      },
    );

    // one line per lifecycle action; every rule lives in the service's transition table
    for (const [path, action] of [
      ["confirm", "confirm"],
      ["check-in", "checkIn"],
      ["check-out", "checkOut"],
      ["no-show", "noShow"],
    ] as const) {
      app.post(
        `/bookings/:id/${path}`,
        { preHandler: can("booking:write") },
        async (req) => {
          const { propertyId, id } = parse(IdParams, req.params);
          return booking.transition(propertyId, id, action, req.actor);
        },
      );
    }

    app.post(
      "/bookings/:id/cancel",
      { preHandler: can("booking:write") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        return booking.transition(
          propertyId,
          id,
          "cancel",
          req.actor,
          parse(StaffCancel, req.body).reason,
        );
      },
    );
  };
