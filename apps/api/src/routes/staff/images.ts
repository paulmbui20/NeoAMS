// src/routes/staff/images.ts  (prefix /api/v1/properties/:propertyId)
// Property and room-type image records. The bytes are uploaded separately to
// /api/v1/uploads; these routes only manage the references.
import type { FastifyPluginAsync } from "fastify";
import * as s from "superstruct";
import { parse } from "@neoams/shared";
import { IdParams, ImageParams, PropertyParams } from "@neoams/shared";
import type { RouteDeps } from "../../http/types";

const NewImage = s.object({
  imageUrl: s.pattern(s.string(), /^\/uploads\/[a-zA-Z0-9._-]+$/),
  altText: s.optional(s.string()),
  isPrimary: s.optional(s.boolean()),
});

const ImagePatch = s.type({
  altText: s.optional(s.nullable(s.string())),
  isPrimary: s.optional(s.boolean()),
});

export const staffImageRoutes =
  ({
    services: { catalog, storage },
    guards: { can },
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    /* ---------------------------------------------------- property images */

    app.get("/images", { preHandler: can("booking:read") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      return { data: catalog.listPropertyImages(propertyId) };
    });

    app.post(
      "/images",
      { preHandler: can("property:manage") },
      async (req, reply) => {
        const { propertyId } = parse(PropertyParams, req.params);
        const input = parse(NewImage, req.body);
        return reply
          .code(201)
          .send(catalog.addPropertyImage(propertyId, input));
      },
    );

    app.patch(
      "/images/:id",
      { preHandler: can("property:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const patch = parse(ImagePatch, req.body);
        return catalog.updatePropertyImage(propertyId, id, patch);
      },
    );

    app.delete(
      "/images/:id",
      { preHandler: can("property:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const result = catalog.deletePropertyImage(propertyId, id);
        // The file itself goes too, so the disk does not fill with orphans.
        const filename = result.imageUrl.replace("/uploads/", "");
        await storage.delete(filename);
        return result;
      },
    );

    /* -------------------------------------------------- room-type images */

    app.get(
      "/room-types/:id/images",
      { preHandler: can("booking:read") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        catalog.getRoomType(propertyId, id);
        return { data: catalog.listRoomTypeImages(id) };
      },
    );

    app.post(
      "/room-types/:id/images",
      { preHandler: can("catalog:manage") },
      async (req, reply) => {
        const { propertyId, id } = parse(IdParams, req.params);
        catalog.getRoomType(propertyId, id);
        const input = parse(NewImage, req.body);
        return reply.code(201).send(catalog.addRoomTypeImage(id, input));
      },
    );

    app.patch(
      "/room-types/:id/images/:imageId",
      { preHandler: can("catalog:manage") },
      async (req) => {
        const { propertyId, id, imageId } = parse(ImageParams, req.params);
        catalog.getRoomType(propertyId, id);
        const patch = parse(ImagePatch, req.body);
        return catalog.updateRoomTypeImage(id, imageId, patch);
      },
    );

    app.delete(
      "/room-types/:id/images/:imageId",
      { preHandler: can("catalog:manage") },
      async (req) => {
        const { propertyId, id, imageId } = parse(ImageParams, req.params);
        catalog.getRoomType(propertyId, id);
        const result = catalog.deleteRoomTypeImage(id, imageId);
        const filename = result.imageUrl.replace("/uploads/", "");
        await storage.delete(filename);
        return result;
      },
    );
  };
