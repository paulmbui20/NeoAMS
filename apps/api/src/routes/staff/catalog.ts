// src/routes/staff/catalog.ts  (prefix /api/v1/properties/:propertyId)
// Inventory: room types, rooms, amenities and services.
import type { FastifyPluginAsync } from "fastify";
import * as s from "superstruct";
import {
  CreateAmenity,
  CreateRoom,
  CreateRoomType,
  CreateService,
  PropertyAmenities,
  RoomQuery,
  RoomTypeAmenities,
  UpdateRoom,
  UpdateRoomStatus,
  UpdateRoomType,
  UpdateService,
  UpdateAmenity,
  parse,
} from "@neoams/shared";
import { IdParams, PropertyParams } from "@neoams/shared";
import type { RouteDeps } from "../../http/types";

export const staffCatalogRoutes =
  ({
    services: { catalog, storage },
    guards: { can },
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    /* ---------------------------------------------------------- room types */

    app.get("/room-types", { preHandler: can("booking:read") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      const types = catalog.listRoomTypes(propertyId);
      return {
        data: types.map((t) => ({
          ...t,
          amenityIds: catalog.roomTypeAmenityIds(t.id),
        })),
      };
    });

    app.post(
      "/room-types",
      { preHandler: can("catalog:manage") },
      async (req, reply) => {
        const { propertyId } = parse(PropertyParams, req.params);
        const input = parse(CreateRoomType, req.body);
        return reply.code(201).send(catalog.createRoomType(propertyId, input));
      },
    );

    app.get(
      "/room-types/:id",
      { preHandler: can("booking:read") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const type = catalog.getRoomType(propertyId, id);
        return { ...type, amenityIds: catalog.roomTypeAmenityIds(id) };
      },
    );

    app.patch(
      "/room-types/:id",
      { preHandler: can("catalog:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const patch = parse(UpdateRoomType, req.body);
        return catalog.updateRoomType(propertyId, id, patch);
      },
    );

    app.delete(
      "/room-types/:id",
      { preHandler: can("catalog:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const result = catalog.deleteRoomType(propertyId, id);
        for (const imageUrl of result.imageUrls) {
          if (!catalog.isImageReferenced(imageUrl)) {
            await storage.delete(imageUrl.replace("/uploads/", ""));
          }
        }
        return { deleted: true, roomType: result.roomType };
      },
    );

    app.put(
      "/room-types/:id/amenities",
      { preHandler: can("catalog:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const { amenityIds } = parse(RoomTypeAmenities, req.body);
        return {
          data: catalog.setRoomTypeAmenities(propertyId, id, amenityIds),
        };
      },
    );

    /* --------------------------------------------------------------- rooms */

    app.get("/rooms", { preHandler: can("booking:read") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      const filter = parse(RoomQuery, req.query);
      return { data: catalog.listRooms(propertyId, filter) };
    });

    app.post(
      "/rooms",
      { preHandler: can("catalog:manage") },
      async (req, reply) => {
        const { propertyId } = parse(PropertyParams, req.params);
        const input = parse(CreateRoom, req.body);
        return reply.code(201).send(catalog.createRoom(propertyId, input));
      },
    );

    app.get("/rooms/:id", { preHandler: can("booking:read") }, async (req) => {
      const { propertyId, id } = parse(IdParams, req.params);
      return catalog.getRoom(propertyId, id);
    });

    app.patch(
      "/rooms/:id",
      { preHandler: can("catalog:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const patch = parse(UpdateRoom, req.body);
        return catalog.updateRoom(propertyId, id, patch);
      },
    );

    app.delete(
      "/rooms/:id",
      { preHandler: can("catalog:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        return catalog.deleteRoom(propertyId, id);
      },
    );

    /** Housekeeping changes the physical state only. */
    app.patch(
      "/rooms/:id/status",
      { preHandler: can("roomStatus:write") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const { status } = parse(UpdateRoomStatus, req.body);
        return catalog.setRoomStatus(propertyId, id, status);
      },
    );

    /* ----------------------------------------------------------- amenities */

    app.get("/amenities", { preHandler: can("booking:read") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      return {
        data: {
          all: catalog.listAmenities(),
          selected: catalog.propertyAmenityIds(propertyId),
        },
      };
    });

    app.post(
      "/amenities",
      { preHandler: can("property:manage") },
      async (req, reply) => {
        const input = parse(CreateAmenity, req.body);
        return reply.code(201).send(catalog.createAmenity(input));
      },
    );

    app.patch(
      "/amenities/:id",
      { preHandler: can("property:manage") },
      async (req) => {
        const { id } = parse(IdParams, req.params);
        const patch = parse(UpdateAmenity, req.body);
        return catalog.updateAmenity(id, patch);
      },
    );

    app.delete(
      "/amenities/:id",
      { preHandler: can("property:manage") },
      async (req) => {
        const { id } = parse(IdParams, req.params);
        return catalog.deleteAmenity(id);
      },
    );

    app.put(
      "/amenities",
      { preHandler: can("property:manage") },
      async (req) => {
        const { propertyId } = parse(PropertyParams, req.params);
        const { amenityIds } = parse(PropertyAmenities, req.body);
        return { data: catalog.setPropertyAmenities(propertyId, amenityIds) };
      },
    );

    /* ------------------------------------------------------------ services */

    app.get("/services", { preHandler: can("booking:read") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      return { data: catalog.listServices(propertyId) };
    });

    app.post(
      "/services",
      { preHandler: can("catalog:manage") },
      async (req, reply) => {
        const { propertyId } = parse(PropertyParams, req.params);
        const input = parse(CreateService, req.body);
        return reply.code(201).send(catalog.createService(propertyId, input));
      },
    );

    app.patch(
      "/services/:id",
      { preHandler: can("catalog:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const patch = parse(UpdateService, req.body);
        return catalog.updateService(propertyId, id, patch);
      },
    );

    app.delete(
      "/services/:id",
      { preHandler: can("catalog:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        return catalog.archiveService(propertyId, id);
      },
    );
  };
