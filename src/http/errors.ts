// src/http/errors.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { StructError } from "superstruct";
import { AppError } from "../core/errors";

export function errorHandler(
  err: unknown,
  req: FastifyRequest,
  reply: FastifyReply,
) {
  if (err instanceof AppError) {
    return reply.code(err.status).send({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  if (err instanceof StructError) {
    return reply.code(400).send({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid request",
        details: err
          .failures()
          .map((f) => ({ path: f.path.join("."), message: f.message })),
      },
    });
  }
  const e = err as { statusCode?: number; code?: string; message?: string };
  if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return reply.code(409).send({
      error: { code: "DUPLICATE", message: "That record already exists" },
    });
  }
  if (e.statusCode && e.statusCode < 500) {
    // Fastify's own 4xx: bad JSON, 429 from rate limit, ...
    return reply.code(e.statusCode).send({
      error: {
        code: e.code ?? "BAD_REQUEST",
        message: e.message ?? "Bad request",
      },
    });
  }
  req.log.error(err); // never leak internals
  return reply
    .code(500)
    .send({ error: { code: "INTERNAL", message: "Something went wrong" } });
}
