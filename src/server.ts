import fastifyCors from "@fastify/cors";
import { fromNodeHeaders } from "better-auth/node";
import Fastify from "fastify";
import { auth } from "./auth";
import { env } from "./env";

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, {
  origin: env.FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
});

fastify.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const req = new Request(url.toString(), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: "Internal authentication error" });
    }
  },
});

fastify.get("/api/me", async (request, reply) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
  if (!session) return reply.status(401).send({ error: "Unauthorized" });
  return { user: session.user, session: session.session };
});

await fastify.listen({ port: env.PORT, host: "0.0.0.0" });
