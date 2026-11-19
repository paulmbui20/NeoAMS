// src/routes/staff/bookings.ts: prefix /api/v1/properties/:propertyId
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../../http/types";
import {
  AddBookingGuest,
  AddBookingService,
  BookingListQuery,
  CreateDeskBooking,
  DeskAvailabilityQuery,
  GuestParam,
  ServiceLineParams,
  StaffCancel,
  UpdateBooking,
} from "@neoams/shared";
import { IdParams, parse, PropertyParams } from "@neoams/shared";

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

    /** Edit party size, requests and deposit. The stay and room are immutable. */
    app.patch(
      "/bookings/:id",
      { preHandler: can("booking:write") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const patch = parse(UpdateBooking, req.body);
        return booking.update(propertyId, id, patch, req.actor);
      },
    );

    /** Add another guest to the party. */
    app.post(
      "/bookings/:id/guests",
      { preHandler: can("booking:write") },
      async (req, reply) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const { guestId } = parse(AddBookingGuest, req.body);
        return reply
          .code(201)
          .send(booking.addGuest(propertyId, id, guestId, req.actor));
      },
    );

    /** Remove an additional guest from the party. */
    app.delete(
      "/bookings/:id/guests/:guestId",
      { preHandler: can("booking:write") },
      async (req) => {
        const { propertyId, id, guestId } = parse(GuestParam, req.params);
        return booking.removeGuest(propertyId, id, guestId, req.actor);
      },
    );

    /** Add a billable service line. */
    app.post(
      "/bookings/:id/services",
      { preHandler: can("booking:write") },
      async (req, reply) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const input = parse(AddBookingService, req.body);
        return reply
          .code(201)
          .send(booking.addService(propertyId, id, input, req.actor));
      },
    );

    /** Remove a service line. */
    app.delete(
      "/bookings/:id/services/:lineId",
      { preHandler: can("booking:write") },
      async (req) => {
        const { propertyId, id, lineId } = parse(ServiceLineParams, req.params);
        return booking.removeService(propertyId, id, lineId, req.actor);
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
