// src/routes/auth.ts: Better Auth catch-all (login, logout, sign-up, change password, update user...)
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsync } from "fastify";
import type { Auth } from "../auth";

export const authRoutes =
  (auth: Auth): FastifyPluginAsync =>
  async (app) => {
    app.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      async handler(request, reply) {
        const req = new Request(
          new URL(request.url, `http://${request.headers.host}`).toString(),
          {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            ...(request.body ? { body: JSON.stringify(request.body) } : {}),
          },
        );
        const response = await auth.handler(req);

        reply.status(response.status);
        response.headers.forEach((value, key) => {
          if (key !== "set-cookie") reply.header(key, value);
        });
        // Login sets several cookies. Copying them one by one would keep only the last, so pass the whole list.
        const cookies = response.headers.getSetCookie();
        if (cookies.length) reply.header("set-cookie", cookies);
        return reply.send(response.body ? await response.text() : null);
      },
    });
  };
