// src/routes/uploads.ts  (prefix /api/v1)
// Image upload and delivery. The storage backend sits behind an interface so
// S3 can replace local disk later without touching the routes.
import type { FastifyPluginAsync } from "fastify";
import * as s from "superstruct";
import { parse } from "@neoams/shared";
import { ConflictError, ValidationError } from "../core/errors";
import { assertAllowedImage } from "../core/uploads";
import type { RouteDeps } from "../http/types";

/** Only these characters can appear in a stored filename. */
const SAFE_NAME = /^[a-f0-9-]+\.(jpg|png|webp)$/;

export const uploadRoutes =
  ({
    services: { catalog, storage },
    guards,
    env,
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    /**
     * Accepts one multipart file under the field name `file`.
     * The type is decided by the bytes, never by the client's headers.
     */
    app.post(
      "/uploads",
      { preHandler: guards.requireUser },
      async (req, reply) => {
        const file = await req.file();
        if (!file) {
          throw new ValidationError(
            "No file was uploaded",
            undefined,
            "NO_FILE",
          );
        }
        if (file.fieldname !== "file") {
          throw new ValidationError(
            "Unexpected file field",
            undefined,
            "NO_FILE",
          );
        }
        const limit = env.MAX_UPLOAD_BYTES;
        const buffer = await file.toBuffer();
        if (buffer.length === 0) {
          throw new ValidationError(
            "The file is empty",
            undefined,
            "EMPTY_FILE",
          );
        }
        if (buffer.length > limit) {
          throw new ValidationError(
            `Images must be smaller than ${Math.floor(limit / 1024 / 1024)} MB`,
            undefined,
            "FILE_TOO_LARGE",
          );
        }
        const image = assertAllowedImage(buffer);
        const saved = await storage.save(buffer, image);
        return reply.code(201).send(saved);
      },
    );

    app.delete(
      "/uploads/:filename",
      { preHandler: guards.requireUser },
      async (req, reply) => {
        const { filename } = parse(
          s.object({ filename: s.pattern(s.string(), SAFE_NAME) }),
          req.params,
        );
        if (catalog.isImageReferenced(`/uploads/${filename}`)) {
          throw new ConflictError(
            "IMAGE_IN_USE",
            "This image is attached to a property or room type",
          );
        }
        await storage.delete(filename);
        return reply.code(204).send();
      },
    );

    /** Serve a stored image. Always with nosniff, never as HTML. */
    app.get("/uploads/:filename", async (req, reply) => {
      const { filename } = parse(
        s.object({ filename: s.string() }),
        req.params,
      );
      if (!SAFE_NAME.test(filename)) {
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Image not found" } });
      }
      try {
        const bytes = await storage.read(filename);
        const ext = filename.split(".").pop();
        const mime =
          ext === "jpg"
            ? "image/jpeg"
            : ext === "png"
              ? "image/png"
              : "image/webp";
        return reply
          .header("Content-Type", mime)
          .header("X-Content-Type-Options", "nosniff")
          .header("Cache-Control", "public, max-age=31536000, immutable")
          .send(bytes);
      } catch {
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Image not found" } });
      }
    });
  };
