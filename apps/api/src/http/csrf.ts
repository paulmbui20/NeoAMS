import type { FastifyRequest, FastifyReply } from "fastify";
import type { Env } from "../env";

export const csrfGuard =
  (env: Env) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method === "GET" || req.method === "OPTIONS") return;

    const origin = req.headers.origin;
    if (origin && origin !== env.FRONTEND_URL) {
      return reply
        .code(403)
        .send({ error: { code: "CSRF_MISMATCH", message: "Invalid origin" } });
    }
  };
