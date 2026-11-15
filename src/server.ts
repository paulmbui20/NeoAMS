import "dotenv/config";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import { auth } from "./auth";

const fastify = Fastify({ logger: true });

// 1. Configure CORS for cookies/credentials
await fastify.register(fastifyCors, {
  origin: process.env.FRONTEND_URL!,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
});

// 2. Register Better Auth catch-all route
fastify.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();

      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, value.toString());
      });

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
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

// 3. Example protected route checking the session
fastify.get("/api/me", async (request, reply) => {
  const headers = new Headers();
  Object.entries(request.headers).forEach(([key, value]) => {
    if (value) headers.append(key, value.toString());
  });

  const session = await auth.api.getSession({ headers });
  if (!session) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  return { user: session.user, session: session.session };
});

await fastify.listen({ port: 3000 });
