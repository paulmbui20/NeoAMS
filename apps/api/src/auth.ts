// src/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import type { Db } from "./db";
import * as schema from "./db/schema";
import type { Env } from "./env";

export const createAuth = (db: Db, env: Env) =>
  betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // Disable public sign-ups as per spec
    },
    trustedOrigins: [
      env.FRONTEND_URL,
      "http://localhost:5173",
      "https://localhost",
    ],
    user: {
      additionalFields: {
        role: { type: "string", input: false },
        mustChangePassword: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
      },
    },
    /**
     * The sign-in rate limit.
     *
     * Better Auth's own default is 3 attempts per 10 seconds, which is
     * enabled in production only. That is fine for one person at a desk,
     * but a lodge's reception shares one address, and one person fumbling
     * their password would lock the whole team out for ten seconds.
     * Ten attempts a minute per address blunts a brute force just as well,
     * without getting in the way of a busy morning.
     *
     * The limit is counted per client address. Behind Caddy the address
     * comes from X-Forwarded-For, which Caddy sets itself and which
     * overwrites anything the client sends.
     */
    rateLimit: {
      enabled: env.RATE_LIMIT_ENABLED,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: env.RATE_LIMIT_SIGN_IN_MAX },
        "/sign-up/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 10 },
      },
    },
    // Cookie configuration: in production (behind Caddy/Traefik) we use
    // SameSite=Lax. In development (separate ports) we need SameSite=None
    // with Secure, which requires HTTPS. For local HTTP development we
    // use a laxer setting that works cross-origin on localhost.
    cookieOptions: {
      sameSite: env.TRUST_PROXY ? "lax" : "none",
      secure: env.TRUST_PROXY,
      // Allow cookies to work on localhost across ports in development
      domain: env.TRUST_PROXY ? undefined : "localhost",
    },
    advanced: {
      ipAddress: {
        // Caddy sets X-Forwarded-For. X-Real-IP is the fallback for
        // installations behind nginx.
        ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      },
    },
    plugins: [admin()],
  });
export type Auth = ReturnType<typeof createAuth>;
